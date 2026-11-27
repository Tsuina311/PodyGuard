import { useState, type FormEvent } from 'react';
import type { LimitedGameWinner, LimitedMatch } from '@podyguard/shared';
import type { LimitedGameCorrection } from '../api';
import { Button } from '../ui/Button';

type Props = {
  match: LimitedMatch;
  playerA: string;
  playerB: string;
  busy: boolean;
  onSave: (correction: LimitedGameCorrection) => Promise<boolean>;
};

type Edit = {
  expectedGameWinners: Array<LimitedGameWinner | null>;
  expectedOutcome: LimitedGameCorrection['expectedOutcome'];
  winners: Array<LimitedGameWinner | ''>;
};

export function LimitedGameScores({ match, playerA, playerB, busy, onSave }: Props) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const games = match.gameWinners ?? [];
  if (!games.length || match.outcome === 'BYE' || match.outcome === 'DOUBLE_LOSS') return null;

  function startEditing() {
    const winners: Edit['winners'] = games.map((winner) => winner ?? '');
    if (match.outcome && winners.length === 2) winners.push('');
    setEdit({
      expectedGameWinners: games,
      expectedOutcome: match.outcome ?? null,
      winners,
    });
    setReason('');
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || busy) return;
    const winners = edit.winners.filter((winner): winner is LimitedGameWinner => winner !== '');
    if (winners.some((winner, index) => winner !== edit.winners[index]) || !winners.length ||
        (!edit.expectedOutcome && winners.length !== edit.expectedGameWinners.length)) {
      setError('Choose the winner of each recorded game in order.');
      return;
    }
    const hasWinner = winners.length >= 2 && new Set(winners).size < winners.length;
    if (winners.length === 3 && winners[0] === winners[1]) {
      setError('The first two games already decide the match. Clear Game 3 or correct the earlier winners.');
      return;
    }
    if (edit.expectedOutcome && !hasWinner && !(edit.expectedOutcome === 'DRAW' && winners.length === 2)) {
      setError('Enter a complete match score. If the first two games were split, enter the Game 3 winner.');
      return;
    }
    setError('');
    if (await onSave({
      expectedGameWinners: edit.expectedGameWinners,
      expectedOutcome: edit.expectedOutcome,
      gameWinners: winners,
      correctionReason: reason.trim(),
    })) setEdit(null);
  }

  if (!edit) {
    return (
      <div className="mb-2">
        <ol aria-label="Recorded game winners" className="space-y-1 text-xs text-muted">
          {games.map((winner, index) => (
            <li key={index}>Game {index + 1} · {winner === 'A' ? playerA : winner === 'B' ? playerB : 'Winner order unknown'}</li>
          ))}
        </ol>
        <Button variant="ghost" size="sm" disabled={busy} onClick={startEditing}>Edit game scores</Button>
      </div>
    );
  }

  const [firstWinner, secondWinner] = edit.winners;
  const finishesMatch = !edit.expectedOutcome && firstWinner && firstWinner === secondWinner;
  return (
    <form className="mb-2 space-y-2 rounded-lg border border-ink/15 p-2" onSubmit={(event) => void save(event)}>
      {edit.expectedGameWinners.includes(null) && (
        <p className="text-xs text-muted">This older match saved totals. Choose the winners in the order they played.</p>
      )}
      {edit.winners.map((winner, index) => (
        <label className="grid gap-1 text-xs font-medium" key={index}>
          Game {index + 1} winner
          <select
            className="min-h-10 rounded-md border border-ink/20 bg-void px-2 text-sm"
            value={winner}
            disabled={busy}
            required={index < 2 || !edit.expectedOutcome}
            onChange={(event) => {
              const next = event.currentTarget.value as Edit['winners'][number];
              setEdit({ ...edit, winners: edit.winners.map((value, slot) => slot === index ? next : value) });
            }}
          >
            <option value="">{index === 2 ? 'Not played' : 'Choose winner'}</option>
            <option value="A">{playerA}</option>
            <option value="B">{playerB}</option>
          </select>
        </label>
      ))}
      {edit.expectedOutcome && (
        <label className="grid gap-1 text-xs font-medium">
          Correction reason
          <input
            className="min-h-10 rounded-md border border-ink/20 bg-void px-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            required
            disabled={busy}
          />
        </label>
      )}
      {finishesMatch && (
        <p className="text-xs text-muted">Saving this score finishes the match with a 2–0 win for {firstWinner === 'A' ? playerA : playerB}.</p>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || Boolean(edit.expectedOutcome && !reason.trim())}>Save game scores</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEdit(null)}>Cancel</Button>
      </div>
    </form>
  );
}
