import type { MailboxesState } from '../types/mailbox';
import type { IMailboxesClient } from './interfaces/client.interface';

export class MailboxesClient implements IMailboxesClient {
  constructor(
    private readonly request: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  getState(signal: AbortSignal) {
    return this.read({ signal, cache: 'no-store' });
  }

  disconnect(mailboxId: string, signal: AbortSignal) {
    return this.read({
      method: 'DELETE',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailboxId }),
    });
  }

  private async read(init: RequestInit): Promise<MailboxesState> {
    const response = await this.request('/api/mailboxes', {
      ...init,
      signal: AbortSignal.any([init.signal!, AbortSignal.timeout(90_000)]),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof data?.error === 'string'
          ? data.error
          : 'Mailbox request failed. Refresh before trying again.',
      );
    }

    return data;
  }
}

export const mailboxesClient = new MailboxesClient();
