export type FeedbackType = 'bug' | 'confusing' | 'idea' | 'other';

export type FeedbackContextDetails = {
  participantStatus?: string;
  gameMode?: string;
};

export type FeedbackTechnicalContext = FeedbackContextDetails & {
  appVersion: string;
  route: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
};

export type FeedbackPayload = {
  type: FeedbackType;
  description: string;
  expectedBehaviour?: string;
  context: FeedbackTechnicalContext;
};
