/**
 * Phrases that must not be resolved to a single rule.
 * "Initiative" is first strike in French and a dungeon designation in English.
 * "Strike" is shared by first strike and double strike.
 */
export const AMBIGUOUS_PHRASES: ReadonlyArray<
  readonly [string, readonly string[]]
> = [
  ['strike', ['first-strike', 'double-strike']],
  ['initiative', ['first-strike', 'the-initiative']],
];
