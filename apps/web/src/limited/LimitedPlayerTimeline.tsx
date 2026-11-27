import { useTranslation } from 'react-i18next';
import {
  limitedModeConfig,
  type EventSnapshot,
  type LimitedSessionStatus,
  type PublicEvent,
  type PublicParticipant,
} from '@podyguard/shared';
import { cx } from '../ui/cx';
import { activeLimitedSession } from './limited-view';

type Step = 'join' | 'ready' | 'seat' | 'draft' | 'deck' | 'play';

const sessionStep: Record<LimitedSessionStatus, Step | 'complete'> = {
  FORMING: 'ready',
  SEATING: 'seat',
  DRAFTING: 'draft',
  DECKBUILDING: 'deck',
  ROUND_ACTIVE: 'play',
  BETWEEN_ROUNDS: 'play',
  COMPLETED: 'complete',
  CANCELLED: 'ready',
};

export function LimitedPlayerTimeline({ event, participant, snapshot }: {
  event: PublicEvent;
  participant: PublicParticipant | null;
  snapshot: EventSnapshot | null;
}) {
  const { t } = useTranslation();
  const joined = participant && participant.status !== 'left';
  const session = activeLimitedSession(snapshot, joined ? participant.id : undefined);
  const mode = session?.mode ?? (joined ? participant.limitedQueueMode : undefined);
  const hasDraft = mode
    ? limitedModeConfig(mode).hasDraftPhase
    : event.limitedModeConfigs?.some(config => config.enabled && limitedModeConfig(config.mode).hasDraftPhase);
  const steps: Step[] = ['join', 'ready', 'seat', ...(hasDraft ? ['draft' as const] : []), 'deck', 'play'];
  const current = session ? sessionStep[session.status] : mode ? 'ready' : 'join';
  const currentIndex = current === 'complete' ? steps.length : steps.indexOf(current);

  return (
    <ol role="list" aria-label={t('limitedTimeline.label')} className="mb-4 grid auto-cols-fr grid-flow-col gap-1.5">
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step} aria-current={active ? 'step' : undefined}
            className={cx('min-w-0 text-center text-[0.7rem] sm:text-xs', active ? 'font-bold text-ink' : 'text-muted')}
          >
            <span aria-hidden className={cx(
              'mb-1.5 block h-1.5 rounded-full',
              complete ? 'bg-neon' : active ? 'bg-neon/45 ring-1 ring-inset ring-neon/65' : 'bg-ink/10',
            )} />
            {t(`limitedTimeline.${step}`)}
            {complete && <span className="sr-only"> {t('limitedTimeline.complete')}</span>}
          </li>
        );
      })}
    </ol>
  );
}
