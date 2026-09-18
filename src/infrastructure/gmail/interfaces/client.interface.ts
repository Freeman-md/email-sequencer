import type { SendResult } from '../../email/types/send-result';
import type { GmailThread } from '../schemas';
import type { OAuth2Client } from 'google-auth-library';

export interface OAuthClientFactory {
  (): OAuth2Client;
}

export interface IGmailClient {
  authorization(state: string): Promise<{ url: string; verifier: string }>;
  exchange(
    code: string,
    verifier: string,
  ): Promise<{ email: string; googleSubject: string; refreshToken?: string }>;
  verifiedRefreshIdentity(
    refreshToken: string,
  ): Promise<{ email: string; googleSubject: string }>;
  accessToken(refreshToken: string): Promise<string>;
  thread(id: string, token: string): Promise<GmailThread>;
  send(
    raw: string,
    token: string,
    threadId?: string,
    beforeSubmit?: () => Promise<void>,
  ): Promise<SendResult>;
}
