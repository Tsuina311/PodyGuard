import type { CommanderSearchProfile } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { CommanderPicker } from './CommanderPicker';
import { cx } from './ui/cx';
import { canHaveSecondCommander, type CommanderSelection } from './scryfall';

export function emptySeatCommanders(length = 8): CommanderSelection[][] {
  return Array.from({ length }, () => []);
}

export function commandersCompleteForSeats(
  seatCount: number,
  commanders: CommanderSelection[][],
): boolean {
  return Array.from({ length: seatCount }, (_, index) => index).every(
    (index) => (commanders[index]?.length ?? 0) > 0,
  );
}

export function CommanderSeatPickers({
  seatCount,
  commanders,
  onChange,
  disabled,
  searchProfile = 'commander',
  names,
  onRename,
  layout = 'grid',
}: {
  seatCount: number;
  commanders: CommanderSelection[][];
  onChange: (next: CommanderSelection[][]) => void;
  disabled?: boolean;
  searchProfile?: CommanderSearchProfile;
  names?: string[];
  onRename?: (index: number, value: string) => void;
  layout?: 'grid' | 'stack';
}) {
  const { t } = useTranslation();
  const inputClass =
    'h-9 w-full rounded-lg border border-muted/20 bg-void/70 px-3 text-sm font-medium outline-none placeholder:text-muted/50 focus:border-neon/70';

  function setSeatCommanders(
    index: number,
    seatCommanders: CommanderSelection[],
  ) {
    const next = [...commanders];
    while (next.length < seatCount) {
      next.push([]);
    }
    next[index] = seatCommanders;
    onChange(next);
  }

  return (
    <div
      className={cx(
        'grid gap-3',
        layout === 'grid' ? 'sm:grid-cols-2' : 'grid-cols-1',
      )}
    >
      {Array.from({ length: seatCount }, (_, index) => {
        const seat = commanders[index] ?? [];
        const playerLabel = t('common.player', { number: index + 1 });
        return (
          <div
            key={String(index)}
            className="border-muted/20 bg-void/50 space-y-2 rounded-xl border p-3"
          >
            {onRename ? (
              <input
                className={inputClass}
                value={names?.[index] ?? ''}
                placeholder={playerLabel}
                aria-label={playerLabel}
                disabled={disabled}
                onChange={(change) => onRename(index, change.target.value)}
              />
            ) : (
              <p className="text-sm font-medium">{playerLabel}</p>
            )}
            <CommanderPicker
              label={t('deckEditor.commander')}
              value={seat[0] ?? null}
              disabled={disabled}
              searchProfile={searchProfile}
              onChange={(commander) =>
                setSeatCommanders(index, commander ? [commander] : [])
              }
            />
            {seat[0] &&
            (seat[1] || canHaveSecondCommander(seat[0])) ? (
              <CommanderPicker
                label={t('deckEditor.secondCommander')}
                value={seat[1] ?? null}
                partnerFor={seat[0]}
                disabled={disabled}
                searchProfile={searchProfile}
                onChange={(commander) =>
                  setSeatCommanders(
                    index,
                    commander ? [seat[0]!, commander] : [seat[0]!],
                  )
                }
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
