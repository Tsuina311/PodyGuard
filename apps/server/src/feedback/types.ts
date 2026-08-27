export const FEEDBACK_TYPES = ['bug', 'confusing', 'idea', 'other'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export type FeedbackContext = {
  appVersion: string;
  route: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  participantStatus?: string;
  gameMode?: string;
};

export type FeedbackSubmission = {
  type: FeedbackType;
  description: string;
  expectedBehaviour?: string;
  context: FeedbackContext;
};

export type FeedbackIssue = {
  title: string;
  body: string;
  labels: string[];
};

export interface FeedbackTransport {
  submit(issue: FeedbackIssue): Promise<void>;
}
