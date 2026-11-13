/** Text-only card reference. Deliberately excludes artwork and print metadata. */
export type CardTextFace = {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power: string;
  toughness: string;
  loyalty: string;
  defense: string;
};

export type CardText = {
  oracleId: string;
  name: string;
  faces: CardTextFace[];
};

/** Validate persisted/untrusted data and copy only the allowed text fields. */
export function parseCardText(value: unknown): CardText | null {
  if (!value || typeof value !== 'object') return null;
  const card = value as Record<string, unknown>;
  if (typeof card.oracleId !== 'string' || !card.oracleId.trim() ||
      typeof card.name !== 'string' || !card.name.trim() ||
      !Array.isArray(card.faces) || !card.faces.length || card.faces.length > 5) return null;
  const faces: CardTextFace[] = [];
  const fields = ['name', 'manaCost', 'typeLine', 'oracleText', 'power', 'toughness', 'loyalty', 'defense'] as const;
  for (const value of card.faces) {
    if (!value || typeof value !== 'object') return null;
    const face = value as Record<string, unknown>;
    if (fields.some(key => typeof face[key] !== 'string' || (face[key] as string).length > 20_000) ||
        !(face.name as string).trim()) return null;
    faces.push(Object.fromEntries(fields.map(key => [key, face[key]])) as CardTextFace);
  }
  return { oracleId: card.oracleId, name: card.name, faces };
}
