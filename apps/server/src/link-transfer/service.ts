import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { LINK_TRANSFER_TTL_MS, TRANSFER_ID, TRANSFER_TOKEN, shareableTransferDestination, type LinkTransferResult } from '@podyguard/shared';
import type { LinkTransferStore } from './store.js';

export class LinkTransferError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const matches = (token: string, expected: string) => TRANSFER_TOKEN.test(token) && timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(expected, 'hex'));

export class LinkTransferService {
  constructor(private store: LinkTransferStore, private now = () => new Date()) {}
  async create() {
    const id = randomUUID(), sendToken = randomBytes(32).toString('hex'), receiveToken = randomBytes(32).toString('hex');
    const now = this.now(), expiresAt = new Date(now.getTime() + LINK_TRANSFER_TTL_MS);
    await this.store.create({ id, sendTokenHash: hash(sendToken), receiveTokenHash: hash(receiveToken), destination: null, expiresAt }, now);
    return { id, sendToken, receiveToken, expiresAt: expiresAt.toISOString() };
  }
  private async require(id: string, token: string, role: 'send' | 'receive') {
    const row = TRANSFER_ID.test(id) ? await this.store.get(id) : undefined;
    if (!row || !matches(token, role === 'send' ? row.sendTokenHash : row.receiveTokenHash)) {
      throw new LinkTransferError(404, 'Transfer not found.');
    }
    if (row.expiresAt <= this.now()) throw new LinkTransferError(410, 'This QR has expired. Generate a new one on the screen.');
    return row;
  }
  async receive(id: string, token: string): Promise<LinkTransferResult> {
    const row = await this.require(id, token, 'receive');
    return { status: row.destination ? 'ACCEPTED' : 'WAITING', expiresAt: row.expiresAt.toISOString(),
      ...(row.destination ? { destination: row.destination } : {}) };
  }
  async send(id: string, token: string, input: unknown) {
    await this.require(id, token, 'send');
    const destination = shareableTransferDestination(input);
    if (!destination) throw new LinkTransferError(400, 'Choose a shareable page in this app. External and device-only pages cannot be sent.');
    const accepted = await this.store.accept(id, hash(token), destination, this.now());
    // The send capability has only one effect. Retries can acknowledge it but never replace it.
    if (!accepted) await this.require(id, token, 'send');
    return { accepted };
  }
}
