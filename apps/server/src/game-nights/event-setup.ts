import { buildTableAreas, createTournamentState, parseGameMode, parseRulesFormat, resolveRulesFormat, validateTableLayouts,
  type InvitationEventSetup, type LimitedEventModeConfig } from '@podyguard/shared';
import { eventMatchOptions } from '@podyguard/matching';
import { assertLifetimeHours, assertPreferredPodSize, assertTableCount, InvalidEventInputError } from '../events/validation.js';
import { normalizeLimitedModeConfigs, parseTournamentFormat, parseTournamentOptions } from '../events/event-service.js';
import { initializeRoundStateForEvent, parseOperationModeInput, parseRoundCountInput } from '../events/round-orchestration.js';

export function parseInvitationEventSetup(value: unknown): InvitationEventSetup | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new InvalidEventInputError('Invalid planned event setup.');
  const body = value as Record<string, unknown>;
  try {
    const gameMode = parseGameMode(body.gameMode), rulesFormat = resolveRulesFormat(gameMode, parseRulesFormat(body.rulesFormat));
    const preferredPodSize = assertPreferredPodSize(gameMode, body.preferredPodSize);
    const tournamentFormat = parseTournamentFormat(body.tournamentFormat), tournamentOptions = parseTournamentOptions(body.tournamentOptions);
    if (body.limitedModeConfigs !== undefined && (!Array.isArray(body.limitedModeConfigs) || body.limitedModeConfigs.some(config => !config || typeof config !== 'object'))) {
      throw new Error('Invalid Limited configuration.');
    }
    // Select fields explicitly: a planned event must never retain a PIN or credentials.
    const limitedModeConfigs = normalizeLimitedModeConfigs(body.limitedModeConfigs as LimitedEventModeConfig[] | undefined).map(config => ({
      mode: config.mode, enabled: config.enabled, matchStructure: config.matchStructure,
      minCohortSize: config.minCohortSize, preferredCohortSize: config.preferredCohortSize, maxCohortSize: config.maxCohortSize,
      allowUndersizedLaunch: config.allowUndersizedLaunch, totalRounds: config.totalRounds,
      draftMinutes: config.draftMinutes, deckbuildingMinutes: config.deckbuildingMinutes, roundMinutes: config.roundMinutes,
      tablePlan: config.tablePlan ? {
        draft: config.tablePlan.draft.map(table => ({ shape: table.shape, seats: table.seats })),
        play: config.tablePlan.play.map(table => ({ shape: table.shape, seats: table.seats })),
      } : undefined,
    }));
    const setup: InvitationEventSetup = {
      tableCount: assertTableCount(Number(body.tableCount)), gameMode, rulesFormat, preferredPodSize,
      lifetimeHours: assertLifetimeHours(body.lifetimeHours),
      operationMode: parseOperationModeInput(body.operationMode) ?? 'ROLLING', roundCount: parseRoundCountInput(body.roundCount),
      allowThreePods: gameMode === 'commander' && body.allowThreePods !== false,
      allowFivePods: gameMode === 'commander' && body.allowFivePods !== false,
      showReturningPlayerSuggestions: body.showReturningPlayerSuggestions !== false,
      tableLayouts: body.tableLayouts === undefined ? undefined : validateTableLayouts(body.tableLayouts).map(table => ({ shape: table.shape, seats: table.seats })),
      tournamentFormat, ...(tournamentFormat ? { tournamentOptions } : {}), limitedModeConfigs,
    };
    if (tournamentFormat) {
      if (['two-headed-giant', 'archenemy-commander', 'emperor'].includes(gameMode)) throw new Error('Tournaments currently require individual winners.');
      createTournamentState(tournamentFormat, tournamentOptions.matchSize ?? 2, tournamentOptions);
    }
    const limitedPlans = limitedModeConfigs.filter(config => config.enabled && config.tablePlan).map(config => config.tablePlan!);
    if (limitedPlans.some(plan => JSON.stringify(plan) !== JSON.stringify(limitedPlans[0]))) throw new Error('Limited modes must share the same table plan.');
    const plan = limitedPlans[0];
    const tables = plan?.play ?? setup.tableLayouts;
    if (tables) {
      const policy = plan ? { allowedSizes: [2], preferredSize: 2 }
        : tournamentFormat ? { allowedSizes: [tournamentOptions.matchSize ?? 2], preferredSize: tournamentOptions.matchSize ?? 2 }
          : eventMatchOptions({ ...setup, gameMode, allowThreePods: setup.allowThreePods!, allowFivePods: setup.allowFivePods! });
      buildTableAreas(tables, policy.allowedSizes!, policy.preferredSize!, plan?.draft);
    }
    if (setup.operationMode === 'ROUNDS') initializeRoundStateForEvent({ ...setup, gameMode, preferredPodSize, allowThreePods: setup.allowThreePods!, allowFivePods: setup.allowFivePods! });
    return setup;
  } catch (error) { throw new InvalidEventInputError(error instanceof Error ? error.message : 'Invalid planned event setup.'); }
}
