/**
 * Build a compact Magic rules index from a local Comprehensive Rules text file.
 *
 * Wizards of the Coast publishes the Comprehensive Rules (© Wizards). This
 * script does not copy rule prose into the app. It keeps:
 *   - rule identifiers
 *   - parent links (hierarchy)
 *   - a short heading only when the source line is a title, not a sentence
 *
 * Usage:
 *   node apps/web/scripts/import-rules-index.mjs \
 *     --input /path/to/MagicCompRules.txt \
 *     --output apps/web/src/tracker/rules-assistant/generated/rule-index.ts
 *
 * Download the current file from https://magic.wizards.com/en/rules first.
 * Do not commit the official document.
 */

import fs from 'node:fs';
import path from 'node:path';

const MAX_HEADING = 64;
const SOURCE_URL = 'https://magic.wizards.com/en/rules';

const CHAPTERS = [
  ['1', 'Game Concepts'],
  ['2', 'Parts of a Card'],
  ['3', 'Card Types'],
  ['4', 'Zones'],
  ['5', 'Turn Structure'],
  ['6', 'Spells, Abilities, and Effects'],
  ['7', 'Additional Rules'],
  ['8', 'Multiplayer Rules'],
  ['9', 'Casual Variants'],
];

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing ${name}`);
  }
  return process.argv[index + 1];
}

function parentOf(id) {
  if (/[a-z]$/.test(id)) {
    return id.slice(0, -1);
  }
  const dot = id.lastIndexOf('.');
  if (dot !== -1) {
    return id.slice(0, dot);
  }
  return id[0] ?? null;
}

/**
 * Title lines are short labels ("Double Strike"). Sentences are official
 * prose and are discarded.
 */
function headingFrom(raw) {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/^["“]+|["”]+$/g, '');
  if (!text || text.length > MAX_HEADING || !/^[A-Z]/.test(text)) {
    return null;
  }
  if (/[.!?:;"“”]/.test(text)) {
    return null;
  }
  if (/^(a|an)\s/i.test(text)) {
    return null;
  }
  const words = text.split(' ');
  if (words.length > 10) {
    return null;
  }
  const lower = ` ${text.toLowerCase()} `;
  if (
    /\s(is|are|means|that|you|your|player|players|when|if|may|must|whenever|each|this|these|only|cannot|can't)\s/.test(
      lower,
    )
  ) {
    return null;
  }
  if (/^\d/.test(text)) {
    return null;
  }
  if (/^(and|or|see|also)\b/i.test(text) || /\bsee also\b/i.test(text)) {
    return null;
  }
  return text;
}

function sliceRules(source) {
  const start = source.search(/\n1\.\s+Game Concepts\b/);
  const glossary = Math.max(
    source.lastIndexOf('\nGlossary'),
    source.lastIndexOf('### Glossary'),
  );
  if (start === -1 || glossary === -1 || glossary <= start) {
    throw new Error(
      'Could not find the numbered rules between "1. Game Concepts" and "Glossary".',
    );
  }
  return source.slice(start, glossary);
}

function extract(source) {
  const body = sliceRules(source);
  const pattern =
    /\b(\d{3}(?:\.\d+)?[a-z]?)\.(?=\s)|\b(\d{3}\.\d+[a-z])(?=\s)/g;
  const marks = [];
  for (const match of body.matchAll(pattern)) {
    const id = match[1] ?? match[2];
    if (!id) {
      continue;
    }
    marks.push({ id, index: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  if (marks.length < 500) {
    throw new Error(`Only found ${marks.length} rule markers; the input looks incomplete.`);
  }

  /** @type {Map<string, { id: string, parentId: string | null, heading: string | null }>} */
  const rules = new Map();
  for (const [id, heading] of CHAPTERS) {
    rules.set(id, { id, parentId: null, heading });
  }

  for (let i = 0; i < marks.length; i += 1) {
    const current = marks[i];
    const next = marks[i + 1];
    const span = body.slice(current.end, next ? next.index : current.end);
    const heading = headingFrom(span);
    const existing = rules.get(current.id);
    if (!existing) {
      rules.set(current.id, {
        id: current.id,
        parentId: parentOf(current.id),
        heading,
      });
      continue;
    }
    if (!existing.heading && heading) {
      existing.heading = heading;
    }
  }

  for (const rule of rules.values()) {
    if (rule.parentId && !rules.has(rule.parentId) && rule.parentId !== null) {
      // A parent can be missing if a title number was not a separate marker.
      // Keep the link; search still resolves the child by its own id.
    }
    if (rule.heading && rule.heading.length > MAX_HEADING) {
      throw new Error(`Heading too long for ${rule.id}`);
    }
  }

  const rows = [...rules.values()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  assertCoverage(rows);
  return rows;
}

function compareIds(left, right) {
  const parse = (id) => {
    const match = /^(\d+)(?:\.(\d+))?([a-z])?$/.exec(id);
    return {
      major: Number(match?.[1] ?? 0),
      minor: Number(match?.[2] ?? -1),
      letter: match?.[3] ?? '',
    };
  };
  const a = parse(left);
  const b = parse(right);
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.letter.localeCompare(b.letter)
  );
}

function assertCoverage(rows) {
  const ids = new Set(rows.map((row) => row.id));
  for (const required of ['100', '702', '702.4', '704', '800', '806', '900', '903', '904', '905']) {
    if (!ids.has(required)) {
      throw new Error(`Missing required rule id ${required}`);
    }
  }
  const multiplayer = rows.filter((row) => row.id.startsWith('8'));
  const casual = rows.filter((row) => row.id.startsWith('9'));
  if (multiplayer.length < 20 || casual.length < 20) {
    throw new Error('Section 800 or 900 looks truncated.');
  }
  const doubleStrike = rows.find((row) => row.id === '702.4');
  if (doubleStrike?.heading !== 'Double Strike') {
    throw new Error(
      `Expected 702.4 heading "Double Strike", got ${JSON.stringify(doubleStrike?.heading)}`,
    );
  }
}

function effectiveDate(source) {
  const match = /effective as of ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(source);
  return match?.[1] ?? 'unknown';
}

function emit(rows, date) {
  const body = rows
    .map((row) => {
      const heading = row.heading === null ? 'null' : JSON.stringify(row.heading);
      const parent = row.parentId === null ? 'null' : JSON.stringify(row.parentId);
      return `  [${JSON.stringify(row.id)}, ${parent}, ${heading}],`;
    })
    .join('\n');
  return `/* eslint-disable */
// Generated by apps/web/scripts/import-rules-index.mjs
// Official Comprehensive Rules prose is NOT included.
// Identifiers and short titles only. Source: ${SOURCE_URL}
// Effective date read from the input document: ${date}

export const RULE_INDEX_SOURCE_URL = ${JSON.stringify(SOURCE_URL)};
export const RULE_INDEX_EFFECTIVE_DATE = ${JSON.stringify(date)};

/** [id, parentId, heading]. Heading is null when the source line was rule prose. */
export const RULE_INDEX_ROWS: ReadonlyArray<
  readonly [string, string | null, string | null]
> = [
${body}
];
`;
}

const inputPath = path.resolve(arg('--input'));
const outputPath = path.resolve(arg('--output'));
const source = fs.readFileSync(inputPath, 'utf8');
const date = effectiveDate(source);
const rows = extract(source);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, emit(rows, date));
const headings = rows.filter((row) => row.heading).length;
console.log(
  `Wrote ${rows.length} rule ids (${headings} headings) effective ${date} -> ${outputPath}`,
);
