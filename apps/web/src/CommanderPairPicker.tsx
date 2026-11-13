import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildFallbackCommanderSelection, type CommanderSearchProfile } from '@podyguard/shared';
import { CommanderPicker } from './CommanderPicker';
import { canHaveSecondCommander, type CommanderSelection } from './scryfall';
import { Button } from './ui/Button';
import { Field } from './ui/Field';

export function CommanderPairPicker({
  value, onChange, disabled, searchProfile = 'commander', primaryLabel,
  allowManual = false,
}: {
  value: CommanderSelection[];
  onChange: (commanders: CommanderSelection[]) => void;
  disabled?: boolean;
  searchProfile?: CommanderSearchProfile;
  primaryLabel?: string;
  allowManual?: boolean;
}) {
  const { t } = useTranslation();
  const [manual, setManual] = useState(false);
  const primary = value[0];

  function manualCard(name: string): CommanderSelection {
    // Preserve spaces while typing; the API trims names when saving.
    return { ...buildFallbackCommanderSelection({ commanderName: name }), name };
  }

  return (
    <div className="space-y-2">
      {manual ? (
        <>
          <Field label="Commander name" value={primary?.name ?? ''} disabled={disabled} required
            onChange={event => onChange([manualCard(event.target.value), ...value.slice(1)])} />
          <label className="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.length > 1} disabled={disabled}
              onChange={event => onChange(event.target.checked
                ? [primary ?? manualCard(''), manualCard('')]
                : value.slice(0, 1))} />
            Two Commanders (Partner or similar)
          </label>
          {value.length > 1 ? (
            <>
              <Field label="Second Commander name" value={value[1]?.name ?? ''} disabled={disabled} required
                onChange={event => onChange([primary ?? manualCard(''), manualCard(event.target.value)])} />
              <p className="text-muted text-xs">Use this only for a legal two-Commander deck. Name-only entries cannot check pairing rules.</p>
            </>
          ) : null}
        </>
      ) : (
        <>
          <CommanderPicker label={primaryLabel ?? t('deckEditor.commander')} value={primary ?? null}
            disabled={disabled} searchProfile={searchProfile} onChange={commander => {
              if (!commander) { onChange([]); return; }
              // Artwork changes keep the same Commander and its selected partner.
              const sameCommander = Boolean(primary && (primary.oracleId || primary.cardId) === (commander.oracleId || commander.cardId));
              onChange(sameCommander ? [commander, ...value.slice(1)] : [commander]);
            }} />
          {primary && (value[1] || canHaveSecondCommander(primary)) ? (
            <CommanderPicker label={t('deckEditor.secondCommander')} value={value[1] ?? null}
              partnerFor={primary} disabled={disabled} searchProfile={searchProfile}
              onChange={commander => onChange(commander ? [primary, commander] : [primary])} />
          ) : null}
        </>
      )}
      {allowManual ? (
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setManual(current => !current)}>
          {manual ? 'Search Scryfall instead' : 'Enter Commander names manually'}
        </Button>
      ) : null}
    </div>
  );
}
