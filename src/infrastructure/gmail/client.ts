import 'server-only';

import { CodeChallengeMethod } from 'google-auth-library';

import { errorSchema, sentMessageSchema, threadSchema } from './schemas';

import type {
  IGmailClient,
  OAuthClientFactory,
} from './interfaces/client.interface';
import type { SendResult } from '../email/types/send-result';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export const GMAIL_METADATA_SCOPE =
  'https://www.googleapis.com/auth/gmail.metadata';

export class GmailClient implements IGmailClient {
  constructor(
    private readonly clientId: string,
    private readonly createOAuthClient: OAuthClientFactory,
    private readonly fetchRequest: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async authorization(state: string) {
    const client = this.createOAuthClient();
    const codes = await client.generateCodeVerifierAsync();

    return {
      verifier: codes.codeVerifier,
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent select_account',
        scope: [GMAIL_SEND_SCOPE, GMAIL_METADATA_SCOPE, 'openid', 'email'],
        state,
        code_challenge: codes.codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      }),
    };
  }

  async exchange(code: string, verifier: string) {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });

    if (
      !tokens.id_token ||
      ![GMAIL_SEND_SCOPE, GMAIL_METADATA_SCOPE].every((scope) =>
        tokens.scope?.split(' ').includes(scope),
      )
    ) {
      throw new Error('Missing permissions');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.clientId,
    });
    const identity = ticket.getPayload();

    if (!identity?.email || !identity.email_verified || !identity.sub)
      throw new Error('No verified email');

    return {
      email: identity.email,
      googleSubject: identity.sub,
      refreshToken: tokens.refresh_token ?? undefined,
    };
  }

  async verifiedRefreshIdentity(refreshToken: string) {
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const access = await client.getAccessToken();
    if (!access.token || !client.credentials.id_token) {
      throw new Error('Stable identity unavailable; reconnect required.');
    }
    const info = await client.getTokenInfo(access.token);
    if (
      ![GMAIL_SEND_SCOPE, GMAIL_METADATA_SCOPE].every((scope) =>
        info.scopes.includes(scope),
      )
    ) {
      throw new Error('Required Gmail permissions unavailable.');
    }
    const ticket = await client.verifyIdToken({
      idToken: client.credentials.id_token,
      audience: this.clientId,
    });
    const identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || !identity.email_verified) {
      throw new Error('Verified identity unavailable; reconnect required.');
    }

    return { email: identity.email, googleSubject: identity.sub };
  }

  async accessToken(refreshToken: string): Promise<string> {
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const result = await client.getAccessToken();

    if (!result.token) throw new Error('Gmail authorization is unavailable.');
    const info = await client.getTokenInfo(result.token);
    if (
      ![GMAIL_SEND_SCOPE, GMAIL_METADATA_SCOPE].every((scope) =>
        info.scopes.includes(scope),
      )
    ) {
      throw new Error(
        'Gmail send or metadata permission is unavailable. Reconnect this mailbox.',
      );
    }

    return result.token;
  }

  async thread(id: string, token: string) {
    try {
      const query = new URLSearchParams({ format: 'metadata' });
      for (const name of ['Message-ID', 'References', 'Subject', 'From', 'To'])
        query.append('metadataHeaders', name);
      const response = await this.fetchRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?${query}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
          cache: 'no-store',
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Thread unavailable');
      const thread = threadSchema.parse(await response.json());
      if (
        thread.id !== id ||
        thread.messages.some((message) => message.threadId !== id)
      )
        throw new Error('Thread mismatch');

      return thread;
    } catch {
      throw new Error(
        'Email was not submitted. Cannot verify the Gmail thread. Check its ID and reconnect Gmail with metadata permission.',
      );
    }
  }

  async send(
    raw: string,
    token: string,
    threadId?: string,
  ): Promise<SendResult> {
    // Use fetch directly: automatic auth-client retries can duplicate a send.
    try {
      const response = await this.fetchRequest(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        },
      );
      if ([400, 401, 403, 404, 413, 422, 429].includes(response.status)) {
        return {
          kind: 'definite',
          message: await this.rejection(response),
        };
      }
      if (!response.ok)
        return {
          kind: 'uncertain',
          message: `Gmail returned HTTP ${response.status}. Check Sent mail before another run.`,
        };
      const data: unknown = await response.json();
      const parsed = sentMessageSchema.safeParse(data);
      if (!parsed.success) {
        return {
          kind: 'uncertain',
          message:
            'Gmail returned no message confirmation. Check Sent mail before another run.',
        };
      }

      return {
        kind: 'confirmed',
        sentAt: this.now().toISOString(),
        gmailMessageId: parsed.data.id,
        gmailThreadId: parsed.data.threadId,
      };
    } catch {
      return {
        kind: 'uncertain',
        message:
          'Gmail did not confirm the outcome. Check Sent mail before another run.',
      };
    }
  }

  private async rejection(response: Response): Promise<string> {
    const prefix = `Gmail rejected the email (HTTP ${response.status}). Draft unchanged.`;

    try {
      const parsed = errorSchema.safeParse(await response.json());
      if (parsed.success) {
        const reasons = [
          ...(parsed.data.error.details ?? []),
          ...(parsed.data.error.errors ?? []),
        ];
        for (const { reason } of reasons) {
          // Only recognized codes and our own text leave the server. Google error
          // messages/metadata may contain request data and are deliberately omitted.
          if (reason && Object.hasOwn(guidance, reason)) {
            return `${prefix} ${reason}: ${guidance[reason]}`;
          }
        }
      }
    } catch {
      // The explicit rejection remains definite even if its body is unreadable.
    }

    return `${prefix} Google supplied no recognized error reason. Check Gmail API enablement, send permission and project quotas.`;
  }
}

const guidance: Record<string, string> = {
  SERVICE_DISABLED:
    'Enable Gmail API in APIs & Services in the Google Cloud project that owns your OAuth client, then allow time for activation.',
  accessNotConfigured:
    'Enable Gmail API in APIs & Services in the Google Cloud project that owns your OAuth client, then allow time for activation.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT:
    'Reconnect Gmail and grant the permission to send email on your behalf.',
  insufficientPermissions:
    'Reconnect Gmail and grant the permission to send email on your behalf.',
  domainPolicy:
    'Your Google Workspace administrator must allow this app to access Gmail.',
  dailyLimitExceeded:
    'The project daily API quota was exceeded. Check Gmail API quotas in Google Cloud before another run.',
  userRateLimitExceeded:
    'The Gmail API request rate for this user was exceeded. Wait before another run and check other apps using this mailbox.',
  rateLimitExceeded:
    'The Gmail API request rate was exceeded. Wait before another run and check project API usage.',
};
