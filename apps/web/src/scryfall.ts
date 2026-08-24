export type { CommanderSelection } from '@podyguard/shared';
import type { CommanderSelection } from '@podyguard/shared';

export type CommanderCandidate = CommanderSelection;

export type CommanderArtwork = {
  cardId: string;
  artCropUri: string;
  setName?: string;
  collectorNumber?: string;
  artist?: string;
};

export function canHaveSecondCommander(
  commander: Pick<CommanderSelection, 'typeLine' | 'oracleText' | 'keywords'>,
): boolean {
  const keywords = commander.keywords.map((keyword) => keyword.toLowerCase());
  const text = commander.oracleText.toLowerCase();
  const type = commander.typeLine.toLowerCase();
  return (
    keywords.some((keyword) =>
      [
        'partner',
        'partner with',
        'friends forever',
        "doctor's companion",
        'choose a background',
      ].includes(keyword),
    ) ||
    /\bpartner\b|friends forever|doctor's companion|choose a background/.test(
      text,
    ) ||
    /\bbackground\b|\bdoctor\b/.test(type)
  );
}
