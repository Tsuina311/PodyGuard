import {
  FEEDBACK_TYPES,
  type FeedbackContext,
  type FeedbackSubmission,
  type FeedbackType,
} from './types.js';

const SECRET_PATTERN =
  /\b(?:Bearer\s+[^\s]+|ps1\.[A-Za-z0-9._~-]+|hs1\.[A-Za-z0-9._~-]+)\b/gi;

export class InvalidFeedbackError extends Error {}

export function parseFeedbackPayload(value: unknown): FeedbackSubmission {
  const body = isRecord(value) ? value : {};
  const type = parseType(body.type);
  const description = requiredText(body.description, 'Description', 4000);
  const expectedBehaviour =
    type === 'bug'
      ? optionalText(body.expectedBehaviour, 'Expected behaviour', 2000)
      : undefined;
  const context = parseContext(body.context);

  return {
    type,
    description,
    ...(expectedBehaviour ? { expectedBehaviour } : {}),
    context,
  };
}

function parseType(value: unknown): FeedbackType {
  if (
    typeof value !== 'string' ||
    !FEEDBACK_TYPES.includes(value as FeedbackType)
  ) {
    throw new InvalidFeedbackError('Choose a valid feedback type.');
  }
  return value as FeedbackType;
}

function parseContext(value: unknown): FeedbackContext {
  const context = isRecord(value) ? value : {};
  const viewport = isRecord(context.viewport) ? context.viewport : {};

  return {
    appVersion: optionalText(context.appVersion, 'App version', 80) ?? 'unknown',
    route: normalizeRoute(optionalText(context.route, 'Route', 200) ?? '/'),
    userAgent:
      optionalText(context.userAgent, 'Device information', 500) ?? 'unknown',
    viewport: {
      width: dimension(viewport.width),
      height: dimension(viewport.height),
    },
    ...(optionalText(context.participantStatus, 'Participant status', 40)
      ? {
          participantStatus: optionalText(
            context.participantStatus,
            'Participant status',
            40,
          ),
        }
      : {}),
    ...(optionalText(context.gameMode, 'Game mode', 60)
      ? { gameMode: optionalText(context.gameMode, 'Game mode', 60) }
      : {}),
  };
}

function requiredText(
  value: unknown,
  label: string,
  maximum: number,
): string {
  const text = cleanText(value);
  if (!text) {
    throw new InvalidFeedbackError(`${label} is required.`);
  }
  if (text.length > maximum) {
    throw new InvalidFeedbackError(
      `${label} must be ${String(maximum)} characters or fewer.`,
    );
  }
  return text;
}

function optionalText(
  value: unknown,
  label: string,
  maximum: number,
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const text = cleanText(value);
  if (text.length > maximum) {
    throw new InvalidFeedbackError(
      `${label} must be ${String(maximum)} characters or fewer.`,
    );
  }
  return text || undefined;
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(SECRET_PATTERN, '[redacted]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function normalizeRoute(route: string): string {
  const withoutQuery = route.split(/[?#]/, 1)[0] || '/';
  return withoutQuery.startsWith('/') ? withoutQuery : '/';
}

function dimension(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100_000
    ? value
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
