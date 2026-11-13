import type { MatchPreview } from '@podyguard/shared';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

export function MatchPreviewPanel({
  preview,
  busy,
  onConfirm,
  onClose,
}: {
  preview: MatchPreview;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Panel title="Proposed pods">
      <p className="text-sm text-muted">
        Based on compatible pools, available seats, waiting order and opponent
        history. Preview does not reserve tables; Match now recalculates using
        the latest state.
      </p>
      {preview.pods.map((pod, index) => (
        <div key={index} className="my-3">
          <h3>
            {pod.tableLabel}: {pod.playerNames.join(', ')}
          </h3>
          <p>
            Pool: {pod.poolId} · {pod.playerNames.length} seats ·{' '}
            {pod.repeatPairs} repeat opponent pair(s) · Longest wait{' '}
            {Math.floor(pod.longestWaitSeconds / 60)} min
          </p>
        </div>
      ))}
      {!preview.pods.length ? (
        <p>No compatible pods can form right now.</p>
      ) : null}
      <ul>
        {preview.waiting.map((person, index) => (
          <li key={index}>
            {person.displayName}:{' '}
            {person.reason === 'NO_FREE_TABLE'
              ? 'Waiting for a free table. Finish a table or add capacity.'
              : 'No legal pod with the current compatible ready players. Wait for more players or review accepted pools and pod sizes.'}
          </li>
        ))}
      </ul>
      <Button disabled={busy || !preview.pods.length} onClick={onConfirm}>
        Confirm with latest players
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Close preview
      </Button>
    </Panel>
  );
}
