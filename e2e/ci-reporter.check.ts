import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { collectFailures, failureAnnotation } from './ci-reporter';
function fixture(outcome: string, messages: string[][]) {
  return {
    outcome: () => outcome,
    titlePath: () => ['', 'webkit', 'phone flow'],
    location: { file: resolve('e2e/quick-play.spec.ts'), line: 12, column: 3 },
    results: messages.map((errors) => ({
      errors: errors.map((message) => ({ message })),
    })),
  };
}
test('reports failed and flaky cases but not passing or skipped tests', () => {
  const failures = collectFailures([
    fixture('unexpected', [['bad contrast']]),
    fixture('flaky', [['first failure'], []]),
    fixture('expected', [[]]),
    fixture('skipped', []),
  ]);
  assert.equal(failures.length, 2);
  assert.equal(failures[0]!.file, 'e2e/quick-play.spec.ts');
  assert.equal(failures[1]!.message, 'first failure');
});
test('escapes workflow-command data and property delimiters', () => {
  const failure = collectFailures([
    fixture('unexpected', [['bad%\n::warning::injected\r']]),
  ])[0]!;
  const annotation = failureAnnotation({ ...failure, title: 'one,two:three' });
  assert(!annotation.includes('\n'));
  assert(!annotation.includes('\r'));
  assert(annotation.includes('one%2Ctwo%3Athree'));
  assert(annotation.endsWith('bad%25%0A::warning::injected%0D'));
});
test('strips terminal colors and bounds the annotation size', () => {
  const failure = collectFailures([
    fixture('unexpected', [['\u001b[31m' + 'a'.repeat(9000) + '\u001b[0m']]),
  ])[0]!;
  assert.equal(failure.message.length, 8000);
  assert(!failure.message.includes('\u001b'));
});
