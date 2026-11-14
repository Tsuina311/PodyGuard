import type { PregameAgreement } from '@podyguard/shared';
export function Agreement({ agreement }: { agreement?: PregameAgreement }) {
  if (!agreement || !Object.keys(agreement).length) return null;
  return (
    <section
      aria-label="Pregame agreement"
      className="my-3 rounded-xl border border-muted/30 p-4"
    >
      <h3 className="font-semibold">Before we play</h3>
      {agreement.pace ? <p>Pace: {agreement.pace}</p> : null}
      {agreement.durationMinutes ? (
        <p>Target game length: {agreement.durationMinutes} minutes</p>
      ) : null}
      {agreement.notes ? (
        <p className="whitespace-pre-wrap break-words">{agreement.notes}</p>
      ) : null}
      <p className="text-muted text-sm">
        A conversation starter, not a matchmaking restriction.
      </p>
    </section>
  );
}
