import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginOAuth,
  finishOAuth,
  GMAIL_SEND_SCOPE,
} from '@/infrastructure/gmail/oauth';
import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { writeToken } from '@/infrastructure/gmail/token-store';

vi.mock('@/infrastructure/config/env', () => ({
  getConfig: () => ({
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-only',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/gmail/callback',
  }),
}));
vi.mock('@/infrastructure/gmail/token-store', () => ({
  readToken: vi.fn(async () => null),
  writeToken: vi.fn(async () => undefined),
}));
afterEach(() => vi.restoreAllMocks());

describe('Gmail OAuth', () => {
  it('requests only send and identity scopes with offline access, state and PKCE', async () => {
    const { url, state } = await beginOAuth();
    const params = new URL(url).searchParams;
    expect(params.get('scope')?.split(' ')).toEqual([
      GMAIL_SEND_SCOPE,
      'openid',
      'email',
    ]);
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('state')).toBe(state);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBeTruthy();
  });
  it('rejects mismatched callback state before exchanging a code', async () => {
    const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken');
    const { state } = await beginOAuth();
    await expect(
      finishOAuth(state, 'wrong-cookie', 'fake-code'),
    ).rejects.toThrow('expired');
    expect(exchange).not.toHaveBeenCalled();
    expect(writeToken).not.toHaveBeenCalled();
  });
  it('rejects expired state', async () => {
    const { state } = await beginOAuth();
    const time = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(time + 601_000);
    await expect(finishOAuth(state, state, 'fake-code')).rejects.toThrow(
      'expired',
    );
  });
  it('stores only the refresh token and verified identity, and consumes state once', async () => {
    const exchange = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockImplementation(async () => ({
        tokens: {
          refresh_token: 'fake-refresh',
          access_token: 'fake-access',
          id_token: 'fake-identity',
          scope: GMAIL_SEND_SCOPE,
        },
        res: null,
      }));
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(
      async () =>
        new LoginTicket('test-envelope', {
          iss: 'https://accounts.google.com',
          sub: 'test-user',
          aud: 'test-client',
          iat: 1,
          exp: 9999999999,
          email: 'operator@example.com',
          email_verified: true,
        }),
    );
    const { state } = await beginOAuth();
    await finishOAuth(state, state, 'fake-code');
    expect(writeToken).toHaveBeenCalledWith({
      refreshToken: 'fake-refresh',
      email: 'operator@example.com',
    });
    expect(exchange).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'fake-code',
        codeVerifier: expect.any(String),
      }),
    );
    await expect(finishOAuth(state, state, 'fake-code')).rejects.toThrow(
      'expired',
    );
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});
