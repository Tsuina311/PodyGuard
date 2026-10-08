import {
  limitedModeConfig,
  type LimitedMode,
  type LimitedSessionStatus,
} from './limited';

export type LimitedSeatState = {
  participantId: string;
  seat: number | null;
  seated: boolean;
  dropped?: boolean;
};

export type LimitedPlayerAction =
  | 'join-lobby'
  | 'ready'
  | 'unready'
  | 'seat'
  | 'seated'
  | 'ack-draft'
  | 'ack-deck'
  | 'none';

export type LimitedHostAction =
  | 'assign'
  | 'start-draft'
  | 'start-deckbuilding'
  | 'none';

export type LimitedCue = {
  title: string;
  detail: string;
  action: LimitedPlayerAction | LimitedHostAction;
  actionLabel: string | null;
};

export function limitedDraftInstructions(mode: LimitedMode): string {
  const config = limitedModeConfig(mode);
  const cards = config.cardsPerPick ?? 1;
  const take =
    cards === 2
      ? 'Take two cards each pick.'
      : 'Take one card each pick.';
  return `Time to open packs. ${take} The first pack goes to the left, then right, then left.`;
}

export function limitedDeckbuildingTitle(): string {
  return 'Time to make the best deck!';
}

export function applyLimitedSeatChoice(
  seats: readonly LimitedSeatState[],
  participantId: string,
  seat: number,
  seatCount: number,
): LimitedSeatState[] {
  if (!Number.isInteger(seat) || seat < 1 || seat > seatCount) {
    throw new Error(`Choose a seat from 1 to ${seatCount}.`);
  }
  const mine = seats.find(
    (row) => row.participantId === participantId && !row.dropped,
  );
  if (!mine) {
    throw new Error('You are not in this pod.');
  }
  const occupant = seats.find(
    (row) => row.seat === seat && !row.dropped && row.participantId !== participantId,
  );
  if (occupant && mine.seat == null) {
    throw new Error(
      'That seat is taken. Choose an open seat first, then you can swap.',
    );
  }
  return seats.map((row) => {
    if (row.dropped) return row;
    if (occupant && row.participantId === participantId) {
      return { ...row, seat: occupant.seat, seated: false };
    }
    if (occupant && row.participantId === occupant.participantId) {
      return { ...row, seat: mine.seat, seated: false };
    }
    if (row.participantId === participantId) {
      return { ...row, seat, seated: false };
    }
    return row;
  });
}

export function confirmLimitedSeat(
  seats: readonly LimitedSeatState[],
  participantId: string,
): LimitedSeatState[] {
  const mine = seats.find(
    (row) => row.participantId === participantId && !row.dropped,
  );
  if (!mine) throw new Error('You are not in this pod.');
  if (mine.seat == null) {
    throw new Error("Choose a seat before tapping I'm seated.");
  }
  return seats.map((row) =>
    row.participantId === participantId ? { ...row, seated: true } : row,
  );
}

export function everyoneSeated(seats: readonly LimitedSeatState[]): boolean {
  const active = seats.filter((row) => !row.dropped);
  return (
    active.length > 0 &&
    active.every((row) => row.seat != null && row.seated)
  );
}

export function recordLimitedPhaseAck(
  already: readonly string[],
  participantId: string,
  activeIds: readonly string[],
): { acked: string[]; complete: boolean } {
  if (!activeIds.includes(participantId)) {
    throw new Error('Only a player in this pod can confirm the phase.');
  }
  const acked = already.includes(participantId)
    ? [...already]
    : [...already, participantId];
  const complete = activeIds.every((id) => acked.includes(id));
  return { acked, complete };
}

export function limitedPlayerCue(input: {
  mode: LimitedMode | null;
  inLobby: boolean;
  ready: boolean;
  session: {
    status: LimitedSessionStatus;
    mode: LimitedMode;
    tableLabel: string | null;
    seat: number | null;
    seated: boolean;
    phaseAckCount: number;
    selfAcked: boolean;
    opponentName: string | null;
    roundNumber: number | null;
    totalRounds: number | null;
  } | null;
}): LimitedCue {
  if (!input.session) {
    if (!input.inLobby) {
      return {
        title: 'Join the lobby',
        detail:
          'Pick the format. You show up on the host screen as soon as you join.',
        action: 'join-lobby',
        actionLabel: 'Join the lobby',
      };
    }
    if (!input.ready) {
      return {
        title: "Tap Ready when you can start",
        detail:
          'The host can see you in the lobby. Ready tells them you are at the table and waiting to be seated.',
        action: 'ready',
        actionLabel: "I'm ready",
      };
    }
    return {
      title: 'You are ready',
      detail:
        'Stay on this screen. The host assigns tables once every player they need is ready.',
      action: 'unready',
      actionLabel: 'Not ready yet',
    };
  }

  const session = input.session;
  const table = session.tableLabel ?? 'your table';

  if (session.status === 'SEATING') {
    if (session.seat == null) {
      return {
        title: `You are at ${table}`,
        detail:
          'Tap an open seat. Names appear as people sit. After you have a seat, tap someone else at this table to swap.',
        action: 'seat',
        actionLabel: null,
      };
    }
    if (!session.seated) {
      return {
        title: `Seat ${session.seat}`,
        detail:
          "Tap I'm seated when you are in that chair. Tap another player at this table to swap seats.",
        action: 'seated',
        actionLabel: "I'm seated",
      };
    }
    return {
      title: 'You are seated',
      detail:
        session.mode === 'SEALED'
          ? "Wait here. The host starts deckbuilding once every player has tapped I'm seated."
          : "Wait here. The host starts the draft once every player has tapped I'm seated.",
      action: 'none',
      actionLabel: null,
    };
  }

  if (session.status === 'DRAFTING') {
    if (session.selfAcked) {
      return {
        title: 'Waiting for the table',
        detail:
          'You confirmed the draft is done. Deckbuilding starts when everyone else confirms.',
        action: 'none',
        actionLabel: null,
      };
    }
    if (session.phaseAckCount > 0) {
      return {
        title: 'Confirm that you are done drafting',
        detail:
          'Another player finished. Confirm when you are done too. Deckbuilding starts once everyone confirms.',
        action: 'ack-draft',
        actionLabel: 'Confirm that you are done drafting',
      };
    }
    return {
      title: limitedDraftInstructions(session.mode),
      detail: 'The timer is the time allowed for the draft.',
      action: 'ack-draft',
      actionLabel: 'We are done drafting',
    };
  }

  if (session.status === 'DECKBUILDING') {
    if (session.selfAcked) {
      return {
        title: 'Deck received',
        detail: 'Matches start automatically once every deck is ready.',
        action: 'none',
        actionLabel: null,
      };
    }
    const packs = limitedModeConfig(session.mode).boosterPacksPerPlayer;
    return {
      title: limitedDeckbuildingTitle(),
      detail:
        session.mode === 'SEALED'
          ? `Open ${packs} packs and build at least 40 cards. Tap Deck is ready when you can play.`
          : 'Build at least 40 cards from the cards you drafted. Tap Deck is ready when you can play.',
      action: 'ack-deck',
      actionLabel: 'Deck is ready',
    };
  }

  if (session.status === 'ROUND_ACTIVE') {
    return {
      title: session.opponentName
        ? `You play ${session.opponentName}`
        : 'You have a bye this round',
      detail: `Round ${session.roundNumber ?? 1} of ${session.totalRounds ?? 1}. Play the match, then report the result here.`,
      action: 'none',
      actionLabel: null,
    };
  }

  if (session.status === 'BETWEEN_ROUNDS') {
    return {
      title: 'Next matches are on the way',
      detail: 'Stay at the table. Pairings appear here as soon as they are ready.',
      action: 'none',
      actionLabel: null,
    };
  }

  if (session.status === 'COMPLETED') {
    return {
      title: 'This pod is finished',
      detail: 'Standings are on this screen.',
      action: 'none',
      actionLabel: null,
    };
  }

  if (session.status === 'CANCELLED') {
    return {
      title: 'The host cancelled this pod',
      detail: 'You can leave the event or wait for another pod.',
      action: 'none',
      actionLabel: null,
    };
  }

  return {
    title: 'The host is still setting the pod',
    detail: 'Stay on this screen. The next step shows up here.',
    action: 'none',
    actionLabel: null,
  };
}

export function limitedHostCue(input: {
  mode: LimitedMode;
  podSize: number;
  joined: number;
  ready: number;
  draftMinutes?: number;
  deckMinutes: number;
  roundMinutes: number;
  session: {
    status: LimitedSessionStatus;
    seated: number;
    active: number;
    phaseAckCount: number;
    tableLabel: string | null;
    roundNumber: number | null;
    totalRounds: number;
  } | null;
}): LimitedCue {
  const clocks =
    input.mode === 'SEALED'
      ? `Deckbuilding ${input.deckMinutes} min · rounds ${input.roundMinutes} min.`
      : `Draft ${input.draftMinutes ?? 50} min · deckbuilding ${input.deckMinutes} min · rounds ${input.roundMinutes} min.`;

  if (!input.session || input.session.status === 'FORMING') {
    const readyToAssign = input.ready >= input.podSize;
    return {
      title: 'Lobby',
      detail: `${input.joined} in the lobby, ${input.ready} of ${input.podSize} ready. Players show up here as soon as they join. ${clocks}`,
      action: readyToAssign ? 'assign' : 'none',
      actionLabel: readyToAssign ? 'Assign to tables' : null,
    };
  }

  const session = input.session;
  const table = session.tableLabel ?? 'the table';

  if (session.status === 'SEATING') {
    if (session.seated < session.active) {
      return {
        title: `Seating at ${table}`,
        detail: `${session.seated} of ${session.active} have tapped I'm seated. Start stays locked until every player has a chair and confirms it.`,
        action: 'none',
        actionLabel: null,
      };
    }
    if (input.mode === 'SEALED') {
      return {
        title: 'Everyone is seated',
        detail: 'Start deckbuilding. There is no draft in Sealed.',
        action: 'start-deckbuilding',
        actionLabel: 'Start deckbuilding',
      };
    }
    return {
      title: 'Everyone is seated',
      detail: 'Start the draft. Players get the pack directions and the draft timer.',
      action: 'start-draft',
      actionLabel: 'Start draft',
    };
  }

  if (session.status === 'DRAFTING') {
    return {
      title: 'Draft is running',
      detail: `${session.phaseAckCount} of ${session.active} confirmed the draft is done. Deckbuilding starts on its own when everyone confirms.`,
      action: 'none',
      actionLabel: null,
    };
  }

  if (session.status === 'DECKBUILDING') {
    return {
      title: limitedDeckbuildingTitle(),
      detail: `${session.phaseAckCount} of ${session.active} have a deck ready. Matches start on their own when everyone is ready.`,
      action: 'none',
      actionLabel: null,
    };
  }

  if (session.status === 'ROUND_ACTIVE' || session.status === 'BETWEEN_ROUNDS') {
    return {
      title: `Round ${session.roundNumber ?? 1} of ${session.totalRounds}`,
      detail:
        input.mode === 'PICK_TWO_DRAFT'
          ? 'Pick-Two plays the diagonals first, then each remaining opponent at the table.'
          : 'Pairings are Swiss: similar records play, and the same two players are not rematched while another pairing exists.',
      action: 'none',
      actionLabel: null,
    };
  }

  return {
    title: session.status === 'COMPLETED' ? 'Pod complete' : 'Pod cancelled',
    detail: 'Start another pod from the lobby when more players are ready.',
    action: 'none',
    actionLabel: null,
  };
}
