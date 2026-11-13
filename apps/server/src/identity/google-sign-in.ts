import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

export class GoogleSignInError extends Error {
  constructor(readonly code: string, message: string, readonly status = 401) {
    super(message);
  }
}

export type VerifiedGoogleAccount = {
  subject: string;
  email: string;
  name: string;
  authoritativeEmail: boolean;
};

// Each app instance owns short-lived, single-use challenges. No cross-site
// cookies are needed between GitHub Pages and Render; sessions use bearer tokens.
export class GoogleSignIn {
  private readonly client = new OAuth2Client({ transporterOptions: { timeout: 10_000, retry: false } });
  private readonly challenges = new Map<string, { expiresAt: number; origin: string | undefined }>();

  constructor(private readonly clientId = process.env.GOOGLE_CLIENT_ID?.trim()) {}

  configuration(origin: string | undefined) {
    if (!this.clientId) return { enabled: false as const };
    for (const [nonce, challenge] of this.challenges) {
      if (challenge.expiresAt <= Date.now()) this.challenges.delete(nonce);
    }
    if (this.challenges.size >= 5000) {
      throw new GoogleSignInError('GOOGLE_SIGN_IN_BUSY', 'Sign-in is busy. Please try again shortly.', 503);
    }
    const nonce = randomBytes(32).toString('base64url');
    this.challenges.set(nonce, { expiresAt: Date.now() + 5 * 60_000, origin });
    return { enabled: true as const, clientId: this.clientId, nonce };
  }

  async verify(credential: unknown, nonce: unknown, origin: string | undefined): Promise<VerifiedGoogleAccount> {
    if (!this.clientId) {
      throw new GoogleSignInError('GOOGLE_SIGN_IN_DISABLED', 'Google sign-in is not configured yet.', 503);
    }
    const challenge = typeof nonce === 'string' ? this.challenges.get(nonce) : undefined;
    if (typeof nonce === 'string') this.challenges.delete(nonce);
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.origin !== origin ||
        typeof credential !== 'string' || credential.length === 0 || credential.length > 16_384) {
      throw new GoogleSignInError('GOOGLE_SIGN_IN_INVALID', 'Sign-in expired or is invalid. Please try again.');
    }
    try {
      // Google's library verifies the signature, audience, issuer and lifetime.
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience: this.clientId });
      const payload = ticket.getPayload();
      if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
          typeof payload.email !== 'string' || !payload.email || payload.email_verified !== true ||
          (payload as typeof payload & { nonce?: string }).nonce !== nonce) throw new Error('Invalid claims');
      const email = payload.email.trim().toLowerCase();
      return {
        subject: payload.sub,
        email,
        name: payload.name || email.split('@')[0] || 'Host',
        // Google does not guarantee current ownership of third-party emails.
        authoritativeEmail: email.endsWith('@gmail.com') || Boolean(payload.hd),
      };
    } catch {
      throw new GoogleSignInError('GOOGLE_SIGN_IN_INVALID', 'Google could not verify this sign-in. Please try again.');
    }
  }
}
