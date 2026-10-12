const QUESTION_PREFIXES = [
  'what does',
  'what do',
  'what is a',
  'what is an',
  'what is the',
  'what is',
  'what are',
  'whats',
  'how does',
  'how do',
  'how is',
  'please explain',
  'can you explain',
  'explain',
  'tell me about',
  'tell me',
  'define',
  'definition of',
  'meaning of',
  'quest ce que',
  'questce que',
  'cest quoi',
  'c est quoi',
  'explique moi',
  'explique',
  'expliquer',
  'comment fonctionne',
  'comment marche',
  'que fait',
  'quelle est la',
  'quel est le',
  'quelle est',
  'quel est',
  'does',
  'do',
  'rule',
  'rules',
  'regle',
  'regles',
].sort((left, right) => right.length - left.length);

const QUESTION_TAILS = ['do', 'work', 'works', 'mean', 'means'];

/** Case, accent, and punctuation folding shared by search and synonyms. */
export function normalizeQuery(raw: string): string {
  const prepared = raw.replace(/\+1\s*\/\s*\+1/gi, ' plusone ');
  return prepared
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripQuestion(query: string): string {
  let current = query;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of QUESTION_PREFIXES) {
      if (current === prefix || current.startsWith(`${prefix} `)) {
        current = current.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  for (const tail of QUESTION_TAILS) {
    if (current.endsWith(` ${tail}`)) {
      current = current.slice(0, -(tail.length + 1)).trim();
    }
  }
  return current;
}

/**
 * Edits needed to turn one word into another. A swapped pair of letters counts
 * as one edit. Anything further than two edits is reported as 3.
 */
export function editDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  const height = left.length;
  const width = right.length;
  if (Math.abs(height - width) > 2) {
    return 3;
  }
  const rows: number[][] = Array.from({ length: height + 1 }, () =>
    Array.from({ length: width + 1 }, () => 0),
  );
  for (let column = 0; column <= width; column += 1) {
    const header = rows[0];
    if (header) {
      header[column] = column;
    }
  }
  for (let row = 1; row <= height; row += 1) {
    const current = rows[row];
    const previous = rows[row - 1];
    const before = rows[row - 2];
    if (!current || !previous) {
      continue;
    }
    current[0] = row;
    let rowMin = row;
    for (let column = 1; column <= width; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let value = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
      if (
        before &&
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        value = Math.min(value, (before[column - 2] ?? 0) + 1);
      }
      current[column] = value;
      if (value < rowMin) {
        rowMin = value;
      }
    }
    if (rowMin > 2) {
      return 3;
    }
  }
  return rows[height]?.[width] ?? 3;
}
