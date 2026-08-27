import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { GithubFeedbackTransport } from './github-transport.js';
import type { FeedbackIssue, FeedbackTransport } from './types.js';
import { createIdentityBoundary } from '../identity/index.js';

class CapturingTransport implements FeedbackTransport {
  readonly issues: FeedbackIssue[] = [];

  async submit(issue: FeedbackIssue): Promise<void> {
    this.issues.push(issue);
  }
}

async function testApp(transport: FeedbackTransport | null) {
  const identity = createIdentityBoundary({
    participantSessionSecret: 'test-secret',
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    isDev: true,
  });
  return buildApp({
    identity,
    events,
    feedbackTransport: transport,
    logger: false,
  });
}

const payload = {
  type: 'bug',
  description: 'The life counter does not update.',
  expectedBehaviour: 'The total should change immediately.',
  context: {
    appVersion: 'abc123',
    route: '/match?token=must-not-survive',
    userAgent: 'Test browser',
    viewport: { width: 390, height: 844 },
    participantStatus: 'playing',
    gameMode: 'commander',
  },
};

describe('feedback HTTP API', () => {
  it('creates a sanitized issue with server-controlled labels', async () => {
    const transport = new CapturingTransport();
    const app = await testApp(transport);

    const response = await app.inject({
      method: 'POST',
      url: '/api/feedback',
      payload: {
        ...payload,
        description: 'Broken @maintainer ps1.secret-token',
        labels: ['security'],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(transport.issues).toHaveLength(1);
    expect(transport.issues[0]).toMatchObject({
      labels: ['type:bug', 'source:in-app'],
    });
    expect(transport.issues[0]?.body).toContain('/match');
    expect(transport.issues[0]?.body).not.toContain('must-not-survive');
    expect(transport.issues[0]?.body).not.toContain('secret-token');
    expect(transport.issues[0]?.body).toContain('@\u200Bmaintainer');

    await app.close();
  });

  it('validates required fields and handles missing configuration', async () => {
    const configured = await testApp(new CapturingTransport());
    const invalid = await configured.inject({
      method: 'POST',
      url: '/feedback',
      payload: { type: 'bug', description: '   ' },
    });
    expect(invalid.statusCode).toBe(400);
    await configured.close();

    const unavailable = await testApp(null);
    const response = await unavailable.inject({
      method: 'POST',
      url: '/feedback',
      payload,
    });
    expect(response.statusCode).toBe(503);
    await unavailable.close();
  });

  it('limits repeated submissions by IP', async () => {
    const app = await testApp(new CapturingTransport());

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/feedback',
        payload,
      });
      expect(response.statusCode).toBe(201);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/feedback',
      payload,
    });
    expect(limited.statusCode).toBe(429);

    await app.close();
  });
});

describe('GitHub feedback transport', () => {
  it('keeps credentials in the authorization header', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', { status: 201 }),
    );
    const transport = new GithubFeedbackTransport(
      'server-only-token',
      'owner/private-feedback',
      request,
    );

    await transport.submit({
      title: '[Idea] Test',
      body: 'Body',
      labels: ['type:idea', 'source:in-app'],
    });

    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/private-feedback/issues',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-only-token',
        }),
      }),
    );
  });
});
