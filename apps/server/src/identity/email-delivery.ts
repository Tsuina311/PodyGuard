export class EmailDeliveryUnavailableError extends Error {
  readonly code = 'EMAIL_DELIVERY_UNAVAILABLE';
  constructor() { super('Email sign-in is unavailable. The host must configure email delivery.'); }
}

export function requireEmailDelivery() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new EmailDeliveryUnavailableError();
  return { apiKey, from };
}

export async function deliverEmailCode(email: string, code: string, challengeId: string): Promise<void> {
  const { apiKey, from } = requireEmailDelivery();
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `auth-${challengeId}` },
      body: JSON.stringify({ from, to: [email], subject: 'Your PodyGuard sign-in code',
        text: `Your PodyGuard verification code is ${code}. It expires in 15 minutes. If you did not request this code, ignore this email.` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new EmailDeliveryUnavailableError();
  } catch {
    // Never return upstream responses, credentials, or verification codes.
    throw new EmailDeliveryUnavailableError();
  }
}
