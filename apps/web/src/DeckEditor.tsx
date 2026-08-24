import { COMMANDER_POOLS } from '@podyguard/shared';
import { CommanderPicker } from './CommanderPicker';
import {
  canHaveSecondCommander,
  type CommanderSelection,
} from './scryfall';
import { Button } from './ui/Button';
import { cx } from './ui/cx';

export type DeckFormRow = {
  name: string;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export function defaultDeckRows(): DeckFormRow[] {
  return [
    { name: '', poolId: 'b3', preference: 'preferred', commanders: [] },
  ];
}

export function DeckEditor({
  decks,
  onChange,
  disabled,
}: {
  decks: DeckFormRow[];
  onChange: (next: DeckFormRow[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<DeckFormRow>) {
    onChange(
      decks.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3">
      <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
        Commander decks
      </p>
      {decks.map((row, index) => (
        <div
          key={String(index)}
          className="rounded-xl border border-muted/20 bg-void/50 p-3"
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {COMMANDER_POOLS.map((pool) => (
              <button
                key={pool.id}
                type="button"
                disabled={disabled}
                className={cx(
                  'rounded-lg border px-2 py-1 font-mono text-xs tracking-wide',
                  row.poolId === pool.id
                    ? 'border-neon/60 bg-neon/15 text-neon'
                    : 'border-muted/20 text-muted hover:border-muted/35 hover:text-ink',
                )}
                onClick={() => update(index, { poolId: pool.id })}
              >
                {pool.short}
              </button>
            ))}
          </div>
          <input
            className="mb-2 h-10 w-full rounded-lg border border-muted/20 bg-void/70 px-3 text-sm outline-none placeholder:text-muted/50 focus:border-neon/70"
            value={row.name}
            disabled={disabled}
            placeholder="Deck name (optional)"
            onChange={(change) => update(index, { name: change.target.value })}
          />
          <div className="mb-2 space-y-2">
            <CommanderPicker
              label="Commander"
              value={row.commanders[0] ?? null}
              disabled={disabled}
              onChange={(commander) =>
                update(index, {
                  commanders: commander ? [commander] : [],
                })
              }
            />
            {row.commanders[0] &&
            (row.commanders[1] ||
              canHaveSecondCommander(row.commanders[0])) ? (
              <CommanderPicker
                label="Second commander"
                value={row.commanders[1] ?? null}
                partnerFor={row.commanders[0]}
                disabled={disabled}
                onChange={(commander) =>
                  update(index, {
                    commanders: commander
                      ? [row.commanders[0]!, commander]
                      : [row.commanders[0]!],
                  })
                }
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={disabled}
              className={cx(
                'text-xs tracking-wide uppercase',
                row.preference === 'preferred' ? 'text-neon' : 'text-muted hover:text-ink',
              )}
              onClick={() =>
                onChange(
                  decks.map((item, rowIndex) => ({
                    ...item,
                    preference: rowIndex === index ? 'preferred' : 'accepted',
                  })),
                )
              }
            >
              {row.preference === 'preferred' ? 'Preferred' : 'Mark preferred'}
            </button>
            {decks.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onChange(decks.filter((_, rowIndex) => rowIndex !== index))
                }
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {decks.length < 8 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...decks,
              {
                name: '',
                poolId: 'b3',
                preference: 'accepted',
                commanders: [],
              },
            ])
          }
        >
          Add accepted deck
        </Button>
      ) : null}
      <p className="text-muted text-xs">
        Same-pool pods only. Extra decks let matching flex you into another bracket.
      </p>
    </div>
  );
}
