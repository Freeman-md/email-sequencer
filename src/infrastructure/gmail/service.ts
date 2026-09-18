import 'server-only';

import libmime from 'libmime';
import addressparser from 'nodemailer/lib/addressparser';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';

import type { IGmailClient } from './interfaces/client.interface';
import type { TokenReader } from './interfaces/token-store.interface';
import type { EmailSender } from '../email/interfaces/sender.interface';
import type { Email } from '../email/types/email';
import type { SendResult } from '../email/types/send-result';

export class GmailService implements EmailSender {
  constructor(
    private readonly client: IGmailClient,
    private readonly tokens: TokenReader,
  ) {}

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
      raw = await this.composeMessage(email, stored.email, reply);
    } catch {
      return {
        kind: 'definite',
        message:
          'Email was not submitted. Check the Gmail connection and email fields.',
      };
    }

    return this.client.send(
      raw,
      token,
      email.gmailThreadId,
      email.beforeSubmit,
    );
  }

  private async replyHeaders(email: Email, token: string, mailbox: string) {
    const thread = await this.client.thread(email.gmailThreadId!, token);
    const messages = thread.messages
      .filter((message) => !message.labelIds.includes('DRAFT'))
      .sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    const latest = messages.at(-1);
    if (!latest) throw new Error('Empty thread');
    if (
      email.gmailOriginalMessageId &&
      !messages.some((message) => message.id === email.gmailOriginalMessageId)
    ) {
      throw new Error(
        'Original Gmail message is absent from this conversation',
      );
    }
    if (
      messages.some((message) => {
        const from =
          message.payload.headers.find(
            (item) => item.name.toLowerCase() === 'from',
          )?.value ?? '';

        return !addressparser(from, { flatten: true }).some(
          (address) => address.address?.toLowerCase() === mailbox.toLowerCase(),
        );
      })
    ) {
      throw new Error('A reply was received in this conversation');
    }
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
    senderEmail: string,
    reply?: { inReplyTo: string; references: string[] },
  ) {
    const message = await new MailComposer({
      ...reply,
      from: senderEmail,
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
