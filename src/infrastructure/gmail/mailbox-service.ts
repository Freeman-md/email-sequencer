import 'server-only';

import { GmailService } from './service';

import type { IGmailClient } from './interfaces/client.interface';
import type { IMailboxTokenStore } from './mailbox-token-store';
import type { Email } from '../email/types/email';
import type { SendResult } from '../email/types/send-result';

export class MailboxGmailService {
  constructor(
    private readonly client: IGmailClient,
    private readonly tokens: IMailboxTokenStore,
  ) {}

  async check(mailboxId: string, googleSubject: string, email: string) {
    const stored = await this.tokens.read(mailboxId);
    if (!stored) {
      return {
        connected: false,
        hasCredentials: false,
        detail: 'Disconnected locally. Reconnect this account to send.',
      };
    }
    if (
      stored.googleSubject !== googleSubject ||
      stored.email.toLowerCase() !== email.toLowerCase()
    ) {
      return {
        connected: false,
        hasCredentials: true,
        detail:
          'Credential identity or email conflicts with Airtable. Reconnect the intended account to repair metadata.',
      };
    }

    try {
      await this.client.accessToken(stored.refreshToken);

      return {
        connected: true,
        hasCredentials: true,
        detail: 'Available for sending',
      };
    } catch {
      return {
        connected: false,
        hasCredentials: true,
        detail:
          'Google authorization expired or provider unavailable. Reconnect or check Google availability.',
      };
    }
  }

  async send(email: Email): Promise<SendResult> {
    if (!email.mailboxId) {
      return {
        kind: 'definite',
        message: 'No sender mailbox selected. Draft unchanged.',
      };
    }
    const mailboxId = email.mailboxId;
    const sender = new GmailService(this.client, {
      read: () => this.tokens.read(mailboxId),
    });

    return sender.send(email);
  }
}
