import type { SendResult } from '../../email/types/send-result';
import type { OAuth2Client } from 'google-auth-library';

export interface OAuthClientFactory {
  (): OAuth2Client;
}

export interface IGmailClient {
  authorization(state: string): Promise<{ url: string; verifier: string }>;
  exchange(
    code: string,
    verifier: string,
  ): Promise<{ email: string; refreshToken?: string }>;
  accessToken(refreshToken: string): Promise<string>;
  send(raw: string, token: string): Promise<SendResult>;
}
