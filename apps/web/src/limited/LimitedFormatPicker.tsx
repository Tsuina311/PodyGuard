import type { LimitedEventModeConfig, LimitedMode } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { cx } from '../ui/cx';
import { LIMITED_MODE_LABELS } from './limited-view';

/** Swiss Limited matches are always 1v1; cohort size is the queue/pod, not the table. */
export function limitedCohortSummary(mode: LimitedMode, playerCount: number): {
  players: number;
  pairing: 'swiss-1v1';
} {
  return { players: playerCount, pairing: 'swiss-1v1' };
}

export function LimitedFormatTiles({
  modes,
  selected,
  onSelect,
  name,
}: {
  modes: readonly LimitedMode[];
  selected: LimitedMode;
  onSelect: (mode: LimitedMode) => void;
  name: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {modes.map((mode) => (
        <label
          key={mode}
          className={cx(
            'cursor-pointer rounded-xl border p-2.5 text-center text-sm font-semibold transition',
            selected === mode
              ? 'border-neon bg-neon/10 text-neon'
              : 'border-muted/20 text-muted hover:border-muted/40',
          )}
        >
          <input
            type="radio"
            name={name}
            value={mode}
            checked={selected === mode}
            onChange={() => onSelect(mode)}
            className="sr-only"
          />
          {LIMITED_MODE_LABELS[mode]}
        </label>
      ))}
    </div>
  );
}

type LimitedTimingFields = {
  matchStructure: 'BO1' | 'BO3';
  totalRounds: number | 'AUTO';
  roundMinutes: number;
  deckbuildingMinutes: number;
  draftMinutes?: number;
  mode: LimitedMode;
};

export function LimitedTimingControls({
  value,
  onChange,
}: {
  value: LimitedTimingFields;
  onChange: (patch: Partial<LimitedTimingFields>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="text-muted text-xs">
        {t('home.limitedMatch')}
        <select
          className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
          value={value.matchStructure}
          onChange={(event) =>
            onChange({
              matchStructure: event.target.value as 'BO1' | 'BO3',
            })
          }
        >
          <option value="BO1">BO1</option>
          <option value="BO3">BO3</option>
        </select>
      </label>
      <label className="text-muted text-xs">
        {t('home.limitedRounds')}
        <input
          className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
          type="number"
          min={1}
          value={value.totalRounds === 'AUTO' ? '' : value.totalRounds}
          placeholder={t('home.limitedRoundsAuto')}
          onChange={(event) =>
            onChange({
              totalRounds: event.target.value
                ? Number(event.target.value)
                : 'AUTO',
            })
          }
        />
      </label>
      <label className="text-muted text-xs">
        {t('home.limitedRoundMinutes')}
        <input
          className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
          type="number"
          min={1}
          value={value.roundMinutes}
          onChange={(event) =>
            onChange({ roundMinutes: Number(event.target.value) })
          }
        />
      </label>
      <label className="text-muted text-xs">
        {t('home.limitedDeckMinutes')}
        <input
          className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
          type="number"
          min={1}
          value={value.deckbuildingMinutes}
          onChange={(event) =>
            onChange({ deckbuildingMinutes: Number(event.target.value) })
          }
        />
      </label>
      {value.mode !== 'SEALED' ? (
        <label className="text-muted text-xs">
          {t('home.limitedDraftMinutes')}
          <input
            className="mt-1 w-full rounded-lg border border-muted/20 bg-hull p-2 text-ink"
            type="number"
            min={1}
            value={value.draftMinutes ?? 50}
            onChange={(event) =>
              onChange({ draftMinutes: Number(event.target.value) })
            }
          />
        </label>
      ) : null}
    </div>
  );
}

export function patchHostLimitedConfig(
  configs: LimitedEventModeConfig[],
  mode: LimitedMode,
  patch: Partial<LimitedEventModeConfig>,
): LimitedEventModeConfig[] {
  return configs.map((row) =>
    row.mode === mode ? { ...row, ...patch, mode } : row,
  );
}

export function selectExclusiveHostLimitedMode(
  configs: LimitedEventModeConfig[],
  mode: LimitedMode,
): LimitedEventModeConfig[] {
  return configs.map((row) => ({
    ...row,
    enabled: row.mode === mode,
  }));
}

export function focusedHostLimitedConfig(
  configs: LimitedEventModeConfig[],
): LimitedEventModeConfig | undefined {
  return (
    configs.find((row) => row.enabled) ??
    configs[0]
  );
}
