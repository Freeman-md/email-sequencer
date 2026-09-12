import 'server-only';

import { randomBytes } from 'node:crypto';

import libmime from 'libmime';
import addressparser from 'nodemailer/lib/addressparser';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';

import type { IGmailClient } from './interfaces/client.interface';
import type { TokenStore } from './interfaces/token-store.interface';
import type { EmailSender } from '../email/interfaces/sender.interface';
import type { Email } from '../email/types/email';
import type { SendResult } from '../email/types/send-result';

export const OAUTH_COOKIE = 'gmail_oauth_state';

export class GmailService implements EmailSender {
  private readonly pending = new Map<
    string,
    { verifier?: string; expires: number }
  >();

  constructor(
    private readonly client: IGmailClient,
    private readonly tokens: TokenStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async beginAuthorization() {
    const now = this.now();

    for (const [key, value] of this.pending) {
      if (value.expires < now) this.pending.delete(key);
    }
    if (this.pending.size >= 20) {
      throw new Error(
        'Too many pending Gmail connections. Wait ten minutes and try again.',
      );
    }

    const state = randomBytes(32).toString('base64url');
    // Reserve a slot before I/O so concurrent starts cannot bypass the limit.
    const entry: { verifier?: string; expires: number } = {
      expires: now + 600_000,
    };
    this.pending.set(state, entry);

    try {
      const { verifier, url } = await this.client.authorization(state);
      entry.verifier = verifier;

      return { state, url };
    } catch {
      this.pending.delete(state);
      throw new Error(
        'Cannot begin Gmail authorization. Check OAuth configuration.',
      );
    }
  }

  async completeAuthorization(
    state: string,
    cookie: string | undefined,
    code: string,
  ) {
    const entry = this.pending.get(state);

    if (!entry?.verifier || cookie !== state || entry.expires < this.now()) {
      throw new Error('Gmail connection expired. Connect Gmail again.');
    }

    this.pending.delete(state);

    try {
      const identity = await this.client.exchange(code, entry.verifier);
      const previous = await this.tokens.read();
      const refreshToken =
        identity.refreshToken ??
        (previous?.email === identity.email
          ? previous.refreshToken
          : undefined);

      if (!refreshToken) throw new Error('No offline access');

      await this.tokens.write({ refreshToken, email: identity.email });
    } catch {
      throw new Error(
        'Gmail connection failed. Grant send and metadata permissions and offline access, and check OAuth configuration and token file permissions.',
      );
    }
  }

  async checkConnection() {
    const stored = await this.tokens.read();

    if (!stored) return { connected: false, detail: 'Connect once via OAuth' };

    try {
      await this.client.accessToken(stored.refreshToken);

      return { connected: true, detail: stored.email };
    } catch {
      return {
        connected: false,
        detail:
          'Gmail authorization expired or unavailable. Connect Gmail again.',
      };
    }
  }

  async send(email: Email): Promise<SendResult> {
    let raw: string;
    let token: string;

    try {
      if (
        !z.email().safeParse(email.email).success ||
        /[\r\n]/.test(email.email) ||
        !email.subject.trim() ||
        !email.message.trim()
      ) {
        return {
          kind: 'definite',
          message:
            'Invalid recipient, subject or message. Correct this Interaction in Airtable.',
        };
      }

      const stored = await this.tokens.read();

      if (!stored) throw new Error('Connect Gmail before sending.');

      token = await this.client.accessToken(stored.refreshToken);
      if (email.isFollowUp && !email.gmailThreadId) {
        return {
          kind: 'definite',
          message:
            'Follow-up has no Gmail Thread ID. Draft unchanged; repair its conversation link before sending.',
        };
      }
      let reply: { inReplyTo: string; references: string[] } | undefined;
      if (email.gmailThreadId) {
        try {
          reply = await this.replyHeaders(email, token, stored.email);
        } catch {
          return {
            kind: 'definite',
            message:
              'Follow-up was not submitted. Verify the Gmail thread, original subject and recipient, check for replies, and reconnect Gmail with metadata permission. Draft unchanged.',
          };
        }
      }
      raw = await this.composeMessage(email, reply);
    } catch {
      return {
        kind: 'definite',
        message:
          'Email was not submitted. Check the Gmail connection and email fields.',
      };
    }

    return this.client.send(raw, token, email.gmailThreadId);
  }

  private async replyHeaders(email: Email, token: string, mailbox: string) {
    const thread = await this.client.thread(email.gmailThreadId!, token);
    const messages = thread.messages
      .filter((message) => !message.labelIds.includes('DRAFT'))
      .sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    const latest = messages.at(-1);
    if (!latest) throw new Error('Empty thread');
    const header = (name: string) =>
      latest.payload.headers.find(
        (h) => h.name.toLowerCase() === name.toLowerCase(),
      )?.value ?? '';
    const addresses = (name: string) =>
      addressparser(header(name), { flatten: true }).map((a) =>
        a.address?.toLowerCase(),
      );
    const subject = (value: string) =>
      libmime
        .decodeWords(value)
        .replace(/^(?:re:\s*)+/i, '')
        .trim();
    // Never attach a draft to another recipient or continue a thread after a reply.
    if (
      !addresses('From').includes(mailbox.toLowerCase()) ||
      !addresses('To').includes(email.email.toLowerCase()) ||
      subject(header('Subject')) !== subject(email.subject)
    )
      throw new Error('Conversation mismatch or reply received');
    const inReplyTo = header('Message-ID').trim();
    if (!/^<[^<>\s]+>$/.test(inReplyTo))
      throw new Error('Missing RFC Message-ID');
    const references = header('References').match(/<[^<>\s]+>/g) ?? [];

    return { inReplyTo, references: [...new Set([...references, inReplyTo])] };
  }

  private async composeMessage(
    email: Email,
    reply?: { inReplyTo: string; references: string[] },
  ) {
    const message = await new MailComposer({
      ...reply,
      to: email.email,
      subject: email.subject,
      text: email.message,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
      .compile()
      .build();

    return message.toString('base64url');
  }
}
