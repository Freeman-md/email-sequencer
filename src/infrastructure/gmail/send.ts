import 'server-only';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';
import { gmailAccessToken } from './oauth';
import { gmailRejection } from './rejection';

export type Email = { email: string; subject: string; message: string };
export type SendResult =
  | { kind: 'confirmed'; sentAt: string }
  | { kind: 'definite'; message: string }
  | { kind: 'uncertain'; message: string };

export function createGmailSender(
  accessToken = gmailAccessToken,
  sendRequest = fetch,
  now = () => new Date(),
) {
  return async (email: Email): Promise<SendResult> => {
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
      const message = await new MailComposer({
        to: email.email,
        subject: email.subject,
        text: email.message,
        disableFileAccess: true,
        disableUrlAccess: true,
      })
        .compile()
        .build();
      raw = message.toString('base64url');
      token = await accessToken();
    } catch {
      return {
        kind: 'definite',
        message:
          'Email was not submitted. Check the Gmail connection and email fields.',
      };
    }
    // Use fetch directly: automatic auth-client retries can duplicate a send.
    try {
      const response = await sendRequest(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        },
      );
      if ([400, 401, 403, 404, 413, 422, 429].includes(response.status)) {
        return {
          kind: 'definite',
          message: await gmailRejection(response),
        };
      }
      if (!response.ok)
        return {
          kind: 'uncertain',
          message: `Gmail returned HTTP ${response.status}. Check Sent mail before another run.`,
        };
      const data: unknown = await response.json();
      if (!z.object({ id: z.string().min(1) }).safeParse(data).success) {
        return {
          kind: 'uncertain',
          message:
            'Gmail returned no message confirmation. Check Sent mail before another run.',
        };
      }
      return { kind: 'confirmed', sentAt: now().toISOString() };
    } catch {
      return {
        kind: 'uncertain',
        message:
          'Gmail did not confirm the outcome. Check Sent mail before another run.',
      };
    }
  };
}
