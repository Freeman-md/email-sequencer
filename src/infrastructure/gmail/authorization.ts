import 'server-only';

import { randomBytes } from 'node:crypto';

import type { IGmailClient } from './interfaces/client.interface';

export const OAUTH_COOKIE = 'gmail_oauth_state';

export class GmailAuthorization {
  private readonly pending = new Map<
    string,
    { verifier?: string; expires: number; mailboxId?: string }
  >();

  constructor(
    private readonly client: IGmailClient,
    private readonly now: () => number = Date.now,
  ) {}

  async begin(mailboxId?: string) {
    for (const [key, value] of this.pending) {
      if (value.expires < this.now()) {
        this.pending.delete(key);
      }
    }
    const state = randomBytes(32).toString('base64url');
    const entry = {
      expires: this.now() + 600_000,
      mailboxId,
      verifier: undefined as string | undefined,
    };
    this.pending.set(state, entry);

    try {
      const authorization = await this.client.authorization(state);
      entry.verifier = authorization.verifier;

      return { state, url: authorization.url };
    } catch {
      this.pending.delete(state);
      throw new Error(
        'Cannot begin Gmail authorization. Check OAuth configuration.',
      );
    }
  }

  async complete(state: string, cookie: string | undefined, code: string) {
    const entry = this.pending.get(state);
    if (!entry?.verifier || cookie !== state || entry.expires < this.now()) {
      throw new Error('Gmail connection expired. Connect Gmail again.');
    }
    this.pending.delete(state);

    try {
      const identity = await this.client.exchange(code, entry.verifier);

      return { ...identity, mailboxId: entry.mailboxId };
    } catch {
      throw new Error(
        'Gmail authorization failed. Grant send and metadata permissions and offline access.',
      );
    }
  }
}
