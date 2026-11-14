import { appendFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { FullConfig, Reporter, Suite } from '@playwright/test/reporter';

type ReportTest = {
  outcome(): string;
  titlePath(): string[];
  location: { file: string; line: number; column: number };
  results: readonly {
    errors: readonly { message?: string; value?: string }[];
  }[];
};
export type BrowserFailure = {
  title: string;
  file: string;
  line: number;
  column: number;
  message: string;
  outcome: string;
};
const escapeData = (value: string) =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (value: string) =>
  escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
export function collectFailures(
  tests: readonly ReportTest[],
): BrowserFailure[] {
  return tests
    .filter((test) => ['unexpected', 'flaky'].includes(test.outcome()))
    .map((test) => {
      const failed = [...test.results]
        .reverse()
        .find((result) => result.errors.length > 0);
      return {
        title: test.titlePath().filter(Boolean).join(' › '),
        file: relative(process.cwd(), test.location.file).split(sep).join('/'),
        line: test.location.line,
        column: test.location.column,
        outcome: test.outcome(),
        message: stripVTControlCharacters(
          failed?.errors
            .map((error) => error.message ?? error.value ?? '')
            .join('\n') ||
            'No structured error was recorded. Inspect the browser report.',
        ).slice(0, 8000),
      };
    });
}
export function failureAnnotation(failure: BrowserFailure): string {
  return `::error file=${escapeProperty(failure.file)},line=${failure.line},col=${failure.column},title=${escapeProperty(`${failure.outcome}: ${failure.title}`)}::${escapeData(failure.message)}`;
}

/** Supplement HTML/JUnit evidence with actionable GitHub run annotations.
 * This reporter never changes test outcomes, retries, or the runner exit code. */
export default class CiBrowserReporter implements Reporter {
  private suite?: Suite;
  onBegin(_config: FullConfig, suite: Suite) {
    this.suite = suite;
  }
  onEnd() {
    const failures = collectFailures(this.suite?.allTests() ?? []);
    for (const failure of failures) console.log(failureAnnotation(failure));
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary)
      appendFileSync(
        summary,
        failures.length
          ? `## Browser test failures\n\n${failures.map((failure) => `### ${failure.title.replace(/[<>]/g, '')}\n\n\`\`\`text\n${failure.message.replaceAll('```', "'''")}\n\`\`\`\n`).join('\n')}`
          : '## Browser tests\n\nNo unexpected or flaky test cases.\n',
      );
  }
}
