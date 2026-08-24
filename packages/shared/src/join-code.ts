/** Public join codes omit 0/O/1/I so they stay readable on a projector. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isJoinCodeFormat(value: string): boolean {
  return (
    value.length === JOIN_CODE_LENGTH &&
    [...value].every((char) => JOIN_CODE_ALPHABET.includes(char))
  );
}
