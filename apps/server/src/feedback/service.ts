import type {
  FeedbackIssue,
  FeedbackSubmission,
  FeedbackTransport,
  FeedbackType,
} from './types.js';

const LABELS: Record<FeedbackType, string> = {
  bug: 'type:bug',
  confusing: 'type:ux',
  idea: 'type:idea',
  other: 'type:question',
};

const TITLES: Record<FeedbackType, string> = {
  bug: 'Bug',
  confusing: 'Confusing experience',
  idea: 'Idea',
  other: 'Feedback',
};

export class FeedbackUnavailableError extends Error {}

export class FeedbackService {
  constructor(private readonly transport: FeedbackTransport | null) {}

  async submit(feedback: FeedbackSubmission): Promise<void> {
    if (!this.transport) {
      throw new FeedbackUnavailableError(
        'Feedback is not configured on this server.',
      );
    }
    await this.transport.submit(toIssue(feedback));
  }
}

function toIssue(feedback: FeedbackSubmission): FeedbackIssue {
  const summary = feedback.description.split(/\r?\n/, 1)[0] ?? '';
  const titleSummary = summary.slice(0, 90).trim();
  const context = feedback.context;

  const sections = [
    '## Feedback',
    markdownText(feedback.description),
    ...(feedback.type === 'bug' && feedback.expectedBehaviour
      ? [
          '## Expected behaviour',
          markdownText(feedback.expectedBehaviour),
        ]
      : []),
    '## Technical context',
    `- App version: ${inline(context.appVersion)}`,
    `- Route: ${inline(context.route)}`,
    `- Device/browser: ${inline(context.userAgent)}`,
    `- Viewport: ${String(context.viewport.width)} × ${String(context.viewport.height)}`,
    ...(context.participantStatus
      ? [`- Participant status: ${inline(context.participantStatus)}`]
      : []),
    ...(context.gameMode
      ? [`- Game mode: ${inline(context.gameMode)}`]
      : []),
    '',
    '_Submitted from PodyGuard. No authentication token or screenshot was attached._',
  ];

  return {
    title: `[${TITLES[feedback.type]}] ${titleSummary || 'In-app feedback'}`,
    body: sections.join('\n\n'),
    labels: [LABELS[feedback.type], 'source:in-app'],
  };
}

function markdownText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]<>#])/g, '\\$1')
    .replace(/@/g, '@\u200B');
}

function inline(value: string): string {
  return `\`${value.replace(/`/g, "'").replace(/@/g, '@\u200B')}\``;
}
