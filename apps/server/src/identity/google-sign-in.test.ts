import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from './index.js';

const clientId = 'podyguard-test.apps.googleusercontent.com';
const origin = 'https://tsuina311.github.io';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function credential(nonce: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', aud: clientId, iat: now, exp: now + 3600,
    sub: 'google-owner', email: 'owner@gmail.com', email_verified: true,
    name: 'Google Owner', nonce, ...overrides,
  })).toString('base64url');
  const data = `${header}.${body}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}

describe('Google production account sign-in', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let store: MemoryEventStore;
  let identity: ReturnType<typeof createIdentityBoundary>;

  beforeEach(async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', clientId);
    // Only key discovery is stubbed: the official verifier checks real RSA signatures.
    vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
      certs: { 'test-key': publicKey }, format: 'PEM' as Awaited<ReturnType<OAuth2Client['getFederatedSignonCertsAsync']>>['format'],
    });
    store = new MemoryEventStore();
    identity = createIdentityBoundary({ participantSessionSecret: 'google-test-session-secret' });
    app = await buildApp({ identity, events: new EventService(store, identity, { isDev: false }), logger: false, serveWeb: false });
  });
  afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  async function challenge() {
    const res = await app.inject({ method: 'POST', url: '/api/auth/google/config', headers: { origin }, payload: {} });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json().clientId).toBe(clientId);
    return res.json().nonce as string;
  }
  async function login(overrides: Record<string, unknown> = {}) {
    const nonce = await challenge();
    return app.inject({ method: 'POST', url: '/api/auth/google', headers: { origin }, payload: { credential: credential(nonce, overrides), nonce } });
  }

  it('creates a Google account, issues a usable session, and keeps identity stable when the email/name changes', async () => {
    const first = await login();
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json().account.authUserId).toBe('google:google-owner');
    const me = await app.inject({ method: 'GET', url: '/account/me', headers: { authorization: `Bearer ${first.json().token}` } });
    expect(me.statusCode).toBe(200);
    const again = await login({ email: 'changed@gmail.com', name: 'Different Name' });
    expect(again.json().account.id).toBe(first.json().account.id);
    expect(again.json().account.displayName).toBe('Google Owner');
  });

  it('links an existing Gmail account without losing its four players, commanders, results, stats or prior session', async () => {
    const dev = new EventService(store, identity, { isDev: true });
    const auth = await dev.startEmailAuth({ email: 'owner@gmail.com', displayName: 'Existing host' });
    const demo = { ...await dev.verifyEmailAuth({ email: auth.email, code: auth.devCode! }),
      playgroup: { id: '' } };
    demo.playgroup = await dev.createPlaygroup(demo.token, { name: 'Existing Friday Friends' });
    const seats = [];
    for (const displayName of ['Ada', 'Bea', 'Cal', 'Dara']) {
      const guest = await dev.createGuestProfile(demo.token, demo.playgroup.id, { displayName });
      const deck = await dev.createSavedDeckProfile(demo.token, demo.playgroup.id, guest.id, {
        commanderName: 'Giada, Font of Hope', bracket: 3,
      });
      seats.push({ guestProfileId: guest.id, savedDeckProfileId: deck.id, displayName,
        resultType: seats.length === 0 ? 'WIN' as const : 'LOSS' as const });
    }
    await dev.recordLocalPlaygroupGame(demo.token, demo.playgroup.id, {
      clientGameId: 'previous-evening', gameMode: 'commander', rulesFormat: 'commander', seats,
    });
    const res = await login();
    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe(demo.account.id);
    expect(res.json().account.displayName).toBe(demo.account.displayName);
    expect(res.json().playgroups[0].id).toBe(demo.playgroup.id);
    for (const token of [res.json().token, demo.token]) {
      const overview = await app.inject({ method: 'GET', url: `/playgroups/${demo.playgroup.id}`, headers: { authorization: `Bearer ${token}` } });
      expect(overview.statusCode).toBe(200);
      expect(overview.json().overview.recordedGamesCount).toBe(1);
      for (const player of overview.json().overview.guests) {
        expect(player.savedDecks).toHaveLength(1);
        expect(player.stats.gamesPlayed).toBe(1);
        expect(player.stats.mostPlayedWith).toHaveLength(3);
      }
    }
  });

  it('links a verified Workspace email and refuses automatic linking for third-party emails', async () => {
    const workspace = await store.upsertUserAccount({ authUserId: 'email:owner@company.example', email: 'owner@company.example', displayName: 'Existing' });
    const linked = await login({ email: 'owner@company.example', hd: 'company.example' });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().account.id).toBe(workspace.id);
    await store.upsertUserAccount({ authUserId: 'email:owner@other.example', email: 'owner@other.example', displayName: 'Private' });
    const blocked = await login({ sub: 'another-google', email: 'owner@other.example' });
    expect(blocked.statusCode).toBe(409);
    expect((await store.findUserAccountByEmail('owner@other.example'))?.authUserId).toBe('email:owner@other.example');
  });

  it('allows a new Google account with a verified third-party email but never rebinds a Google account by email', async () => {
    expect((await login({ email: 'new@other.example' })).statusCode).toBe(200);
    expect((await login({ sub: 'different-subject', email: 'new@other.example', hd: 'other.example' })).statusCode).toBe(409);
  });

  it.each([
    ['wrong audience', { aud: 'another-app' }],
    ['wrong issuer', { iss: 'https://attacker.example' }],
    ['expired token', { iat: 1, exp: 2 }],
    ['unverified email', { email_verified: false }],
    ['missing subject', { sub: '' }],
    ['wrong nonce', { nonce: 'another-browser' }],
  ])('rejects %s', async (_name, overrides) => {
    const res = await login(overrides);
    expect(res.statusCode).toBe(401);
    expect(await store.findUserAccountByEmail('owner@gmail.com')).toBeUndefined();
  });

  it('rejects forged signatures, missing challenges, expired challenges, origin changes and replay', async () => {
    const nonce = await challenge();
    const signed = credential(nonce);
    const forged = `${signed.slice(0, signed.lastIndexOf('.') + 1)}${Buffer.alloc(256).toString('base64url')}`;
    const post = (token: string, value: string, requestOrigin = origin) => app.inject({ method: 'POST', url: '/auth/google', headers: { origin: requestOrigin }, payload: { credential: token, nonce: value } });
    expect((await post(forged, nonce)).statusCode).toBe(401);
    expect((await post(signed, 'missing')).statusCode).toBe(401);
    const wrongOrigin = await challenge();
    expect((await post(credential(wrongOrigin), wrongOrigin, 'https://attacker.example')).statusCode).toBe(401);
    const expired = await challenge();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60_000);
    expect((await post(credential(expired), expired)).statusCode).toBe(401);
    clock.mockRestore();
    const valid = await challenge();
    const token = credential(valid);
    expect((await post(token, valid)).statusCode).toBe(200);
    expect((await post(token, valid)).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/google', headers: { 'content-type': 'text/plain' }, payload: '{}' })).statusCode).toBe(415);
  });

  it('fails closed without configuration and disables email/Neon shortcuts in production', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const disabled = await buildApp({ identity, events: new EventService(store, identity, { isDev: false }), logger: false, serveWeb: false });
    try {
      expect((await disabled.inject({ method: 'POST', url: '/auth/google/config', payload: {} })).json()).toEqual({ enabled: false });
      expect((await disabled.inject({ method: 'POST', url: '/auth/google', payload: { credential: 'anything', nonce: 'anything' } })).statusCode).toBe(503);
    } finally { await disabled.close(); }
    for (const [url, payload] of [
      ['/auth/email/start', { email: 'owner@gmail.com' }],
      ['/auth/email/verify', { email: 'owner@gmail.com', code: '123456' }],
      ['/auth/neon', { neonUserId: 'unverified', email: 'owner@gmail.com' }],
    ] as const) {
      expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(401);
    }
  });

  it('keeps parallel first sign-ins from replacing the first Google binding', async () => {
    await store.upsertUserAccount({ authUserId: 'email:owner@gmail.com', email: 'owner@gmail.com', displayName: 'Owner' });
    const responses = await Promise.all([login({ sub: 'first' }), login({ sub: 'second' })]);
    expect(responses.map(res => res.statusCode).sort()).toEqual([200, 409]);
  });
});
