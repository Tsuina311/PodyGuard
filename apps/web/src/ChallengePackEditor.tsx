import { useMemo, useState } from 'react';
import {
  CHALLENGE_CATEGORIES,
  CHALLENGE_PRIMITIVE_TYPES,
  OFFICIAL_COMMANDER_CHALLENGES,
  type Challenge,
  type ChallengePack,
  type ChallengePrimitive,
  type PublicEvent,
} from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { ApiError, saveChallengePack } from './api';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';

type Props = {
  joinCode: string;
  hostToken: string;
  event: PublicEvent;
  onEvent: (event: PublicEvent) => void;
  onError: (message: string | null) => void;
};

export function ChallengePackEditor({
  joinCode,
  hostToken,
  event,
  onEvent,
  onError,
}: Props) {
  const { t } = useTranslation();
  const current = event.challengePack ?? OFFICIAL_COMMANDER_CHALLENGES;
  const isOfficial = current.id === OFFICIAL_COMMANDER_CHALLENGES.id;
  const [draft, setDraft] = useState<ChallengePack>(structuredClonePack(current));
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(draft.challenges) !== JSON.stringify(current.challenges)
      || draft.name !== current.name
      || draft.description !== current.description,
    [current, draft],
  );

  async function run(
    mode: 'copy-official' | 'from-scratch' | 'save',
    pack?: ChallengePack,
  ) {
    setBusy(true);
    onError(null);
    try {
      const result = await saveChallengePack(joinCode, hostToken, { mode, pack });
      onEvent(result.event);
      if (result.event.challengePack) {
        setDraft(structuredClonePack(result.event.challengePack));
      }
    } catch (caught) {
      onError(
        caught instanceof ApiError ? caught.message : t('common.errors.savePack'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={t('challengePack.title')}
      aside={
        isOfficial
          ? t('common.official')
          : `private v${String(event.challengePackVersion ?? 1)}`
      }
    >
      <p className="text-muted mb-3 text-sm">{t('challengePack.description')}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="glass"
          size="sm"
          disabled={busy}
          onClick={() => void run('copy-official')}
        >
          {t('challengePack.copyOfficial')}
        </Button>
        <Button
          variant="glass"
          size="sm"
          disabled={busy}
          onClick={() => void run('from-scratch')}
        >
          {t('challengePack.startBlank')}
        </Button>
        <Button
          size="sm"
          disabled={busy || isOfficial || !dirty}
          onClick={() => void run('save', draft)}
        >
          {busy ? t('common.saving') : t('challengePack.saveNewVersion')}
        </Button>
      </div>
      {isOfficial ? (
        <p className="text-muted text-sm">{t('challengePack.editHint')}</p>
      ) : (
        <>
          <Field
            label={t('challengePack.packName')}
            value={draft.name}
            onChange={(change) =>
              setDraft({ ...draft, name: change.target.value })
            }
          />
          <Field
            label={t('challengePack.descriptionLabel')}
            value={draft.description}
            onChange={(change) =>
              setDraft({ ...draft, description: change.target.value })
            }
          />
          <ul className="space-y-4">
            {draft.challenges.map((challenge, index) => (
              <li
                key={challenge.id}
                className="border-muted/20 rounded-xl border p-3"
              >
                <ChallengeEditor
                  challenge={challenge}
                  onChange={(next) => {
                    const challenges = [...draft.challenges];
                    challenges[index] = next;
                    setDraft({ ...draft, challenges });
                  }}
                  onRemove={() =>
                    setDraft({
                      ...draft,
                      challenges: draft.challenges.filter((_, i) => i !== index),
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy || draft.challenges.length >= 16}
            onClick={() =>
              setDraft({
                ...draft,
                challenges: [
                  ...draft.challenges,
                  blankChallenge(
                    `claim-${String(draft.challenges.length + 1)}`,
                    t('challengePack.newClaimName'),
                    t('challengePack.newClaimDescription'),
                  ),
                ],
              })
            }
          >
            {t('challengePack.addChallenge')}
          </Button>
        </>
      )}
    </Panel>
  );
}

function ChallengeEditor({
  challenge,
  onChange,
  onRemove,
}: {
  challenge: Challenge;
  onChange: (challenge: Challenge) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field
        label={t('challengePack.id')}
        value={challenge.id}
        onChange={(change) => onChange({ ...challenge, id: change.target.value })}
      />
      <Field
        label={t('challengePack.name')}
        value={challenge.name}
        onChange={(change) =>
          onChange({ ...challenge, name: change.target.value })
        }
      />
      <Field
        label={t('challengePack.descriptionLabel')}
        wrapperClassName="sm:col-span-2"
        value={challenge.description}
        onChange={(change) =>
          onChange({ ...challenge, description: change.target.value })
        }
      />
      <label className="text-muted mb-4 flex flex-col gap-1.5 text-xs font-medium tracking-[0.14em] uppercase">
        {t('challengePack.category')}
        <select
          className="border-muted/20 bg-void/70 text-ink h-11 rounded-xl border px-3.5 text-sm"
          value={challenge.category}
          onChange={(change) =>
            onChange({
              ...challenge,
              category: change.target.value as Challenge['category'],
            })
          }
        >
          {CHALLENGE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <Field
        label={t('challengePack.points')}
        type="number"
        min={1}
        max={20}
        value={challenge.points}
        onChange={(change) =>
          onChange({ ...challenge, points: Number(change.target.value) })
        }
      />
      <label className="text-muted mb-4 flex flex-col gap-1.5 text-xs font-medium tracking-[0.14em] uppercase">
        {t('challengePack.primitive')}
        <select
          className="border-muted/20 bg-void/70 text-ink h-11 rounded-xl border px-3.5 text-sm"
          value={challenge.primitive.type}
          onChange={(change) => {
            const primitive = primitiveFromType(change.target.value);
            onChange({
              ...challenge,
              primitive,
              detectionMode: detectionFor(primitive),
              confirmationQuestion:
                primitive.type === 'players_eliminated'
                  ? challenge.confirmationQuestion ??
                    t('challengePack.defaultConfirmation')
                  : undefined,
            });
          }}
        >
          {CHALLENGE_PRIMITIVE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      {'threshold' in challenge.primitive ? (
        <Field
          label={t('challengePack.threshold')}
          type="number"
          min={1}
          max={999}
          value={challenge.primitive.threshold}
          onChange={(change) =>
            onChange({
              ...challenge,
              primitive: {
                ...challenge.primitive,
                threshold: Number(change.target.value),
              } as ChallengePrimitive,
            })
          }
        />
      ) : null}
      {challenge.detectionMode === 'confirmation' ? (
        <Field
          label={t('challengePack.confirmationQuestion')}
          wrapperClassName="sm:col-span-2"
          value={challenge.confirmationQuestion ?? ''}
          onChange={(change) =>
            onChange({ ...challenge, confirmationQuestion: change.target.value })
          }
        />
      ) : null}
      <div className="sm:col-span-2">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          {t('common.remove')}
        </Button>
      </div>
    </div>
  );
}

function structuredClonePack(pack: ChallengePack): ChallengePack {
  return {
    ...pack,
    challenges: pack.challenges.map((challenge) => ({
      ...challenge,
      primitive: { ...challenge.primitive },
    })),
  };
}

function blankChallenge(
  id: string,
  name: string,
  description: string,
): Challenge {
  return {
    id,
    name,
    description,
    category: 'alternative',
    detectionMode: 'manual',
    points: 1,
    repeatRule: 'once-per-event',
    primitive: { type: 'manual_claim' },
  };
}

function primitiveFromType(type: string): ChallengePrimitive {
  if (type === 'life_reaches' || type === 'life_below_then_win') {
    return { type, threshold: type === 'life_reaches' ? 100 : 5 };
  }
  if (type === 'players_eliminated') {
    return { type, threshold: 2 };
  }
  if (
    type === 'win_by_commander_damage' ||
    type === 'win_by_poison' ||
    type === 'manual_claim'
  ) {
    return { type };
  }
  return { type: 'manual_claim' };
}

function detectionFor(
  primitive: ChallengePrimitive,
): Challenge['detectionMode'] {
  if (primitive.type === 'manual_claim') {
    return 'manual';
  }
  if (primitive.type === 'players_eliminated') {
    return 'confirmation';
  }
  return 'automatic';
}
