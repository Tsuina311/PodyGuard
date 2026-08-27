import type { FeedbackIssue, FeedbackTransport } from './types.js';

export class GithubFeedbackTransport implements FeedbackTransport {
  constructor(
    private readonly token: string,
    private readonly repository: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async submit(issue: FeedbackIssue): Promise<void> {
    const response = await this.request(
      `https://api.github.com/repos/${this.repository}/issues`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'PodyGuard-feedback',
        },
        body: JSON.stringify(issue),
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub feedback request failed with status ${String(response.status)}.`,
      );
    }
  }
}

export function githubFeedbackTransportFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): FeedbackTransport | null {
  const token = environment.GITHUB_FEEDBACK_TOKEN?.trim();
  const repository = environment.GITHUB_FEEDBACK_REPO?.trim();
  if (!token || !repository) {
    return null;
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(
      'GITHUB_FEEDBACK_REPO must use the owner/repository format.',
    );
  }
  return new GithubFeedbackTransport(token, repository);
}
