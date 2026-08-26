export type SchemeCard = {
  id: string;
  name: string;
  ongoing: boolean;
  imageUrl: string;
};

const ONGOING = new Set([
  '332',
  '333',
  '334',
  '336',
  '340',
  '341',
  '344',
  '345',
  '354',
  '360',
]);

const SCHEME_NAMES: Array<[string, string]> = [
  ['328', 'Behold the Power of Destruction'],
  ['329', 'Chaos Is My Plaything'],
  ['330', 'Choose Your Champion'],
  ['331', 'Choose Your Demise'],
  ['332', 'Dark Wings Bring Your Downfall'],
  ['333', 'Fear My Authority'],
  ['334', 'I Am Duskmourn'],
  ['335', 'I Am Never Alone'],
  ['336', 'I Am Untouchable'],
  ['337', 'I Call for Slaughter'],
  ['338', 'I Will Savor Your Agony'],
  ['339', 'Kneel Before My Legions'],
  ['340', 'Mine Is the Only Truth'],
  ['341', 'My Champion Stands Supreme'],
  ['342', 'My Crushing Masterstroke'],
  ['343', 'My Followers Ascend'],
  ['344', 'My Laughter Echoes'],
  ['345', 'My Tendrils Run Deep'],
  ['346', 'My Wealth Will Bury You'],
  ['347', 'My Will Is Irresistible'],
  ['348', 'My Wings Enfold All'],
  ['349', 'No Secret Is Hidden from Me'],
  ['350', 'Only I Know What Awaits'],
  ['351', 'Plots That Span Centuries'],
  ['352', 'Power Without Equal'],
  ['353', 'A Premonition of Your Demise'],
  ['354', 'Reality Is Mine to Control'],
  ['355', 'Rot Like the Scum You Are'],
  ['356', 'Running Is Useless'],
  ['357', 'Time Bends to My Will'],
  ['358', 'When Will You Learn?'],
  ['359', 'You Are Unworthy of Mercy'],
  ['360', 'You Cannot Hide from Me'],
  ['361', 'You Exist Only to Amuse'],
  ['362', 'You Live Only Because I Will It'],
  ['363', 'You Will Know True Suffering'],
  ['364', 'Your Mistake Is My Triumph'],
  ['365', 'Your Nightmares Are Delicious'],
  ['366', 'Your Own Face Mocks You'],
  ['367', 'Your Plans Mean Nothing'],
];

/** The forty schemes shipped across the four Duskmourn Commander decks. */
export const ARCHENEMY_SCHEMES: SchemeCard[] = SCHEME_NAMES.map(
  ([id, name]) => ({
    id,
    name,
    ongoing: ONGOING.has(id),
    imageUrl: `https://api.scryfall.com/cards/dsc/${id}?format=image&version=normal`,
  }),
);

export function schemeById(id: string): SchemeCard | undefined {
  return ARCHENEMY_SCHEMES.find((scheme) => scheme.id === id);
}

export function shuffleSchemeIds(
  random: () => number = Math.random,
): string[] {
  const ids = ARCHENEMY_SCHEMES.map((scheme) => scheme.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [ids[index], ids[swapWith]] = [ids[swapWith]!, ids[index]!];
  }
  return ids;
}

export function randomPlayerId(
  playerIds: string[],
  random: () => number = Math.random,
): string | undefined {
  return playerIds[Math.floor(random() * playerIds.length)];
}

export function randomTwoHeadedTeam(
  playerIds: string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...playerIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [
      shuffled[swapWith]!,
      shuffled[index]!,
    ];
  }
  return shuffled.slice(0, 2);
}
