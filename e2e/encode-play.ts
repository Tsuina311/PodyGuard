/**
 * Minimal `?play=` encoder for e2e — mirrors apps/web direct-play-share v1
 * without importing the Vite React graph.
 */
export function encodePlayPayloadFromStoredConfig(raw: string): string {
  const config = JSON.parse(raw) as {
    gameMode: string;
    rulesFormat: string;
    seatCount: number;
    names: string[];
    commanders?: Array<
      Array<{
        oracleId: string;
        cardId: string;
        name: string;
        typeLine?: string;
        oracleText?: string;
        keywords?: string[];
      }>
    >;
  };
  const seatCount = config.seatCount;
  const payload = {
    v: 1 as const,
    g: config.gameMode,
    r: config.rulesFormat,
    s: seatCount,
    n: config.names.slice(0, seatCount),
    c: (config.commanders ?? [])
      .slice(0, seatCount)
      .map((seat) =>
        seat.map((commander) => ({
          o: commander.oracleId,
          i: commander.cardId,
          n: commander.name,
          ...(commander.typeLine ? { t: commander.typeLine } : {}),
          ...(commander.oracleText ? { x: commander.oracleText } : {}),
          ...(commander.keywords?.length ? { k: commander.keywords } : {}),
        })),
      ),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
