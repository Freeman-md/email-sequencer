import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GmailClient,
  GMAIL_SEND_SCOPE,
  GMAIL_METADATA_SCOPE,
} from '@/infrastructure/gmail/client';
import { GmailService } from '@/infrastructure/gmail/service';

function setup() {
  const writeToken = vi.fn(async () => undefined);
  const service = new GmailService(
    new GmailClient(
      'test-client',
      () =>
        new OAuth2Client({
          clientId: 'test-client',
          clientSecret: 'test-only',
          redirectUri: 'http://localhost:3000/api/gmail/callback',
        }),
    ),
    { read: vi.fn(async () => null), write: writeToken },
  );

  return { service, writeToken };
}
afterEach(() => vi.restoreAllMocks());

describe('Gmail OAuth', () => {
  it('requests send, metadata and identity scopes with offline access, state and PKCE', async () => {
    const { service } = setup();
    const { url, state } = await service.beginAuthorization();
    const params = new URL(url).searchParams;
    expect(params.get('scope')?.split(' ')).toEqual([
      GMAIL_SEND_SCOPE,
      GMAIL_METADATA_SCOPE,
      'openid',
      'email',
    ]);
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('state')).toBe(state);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBeTruthy();
  });
  it('rejects mismatched callback state before exchanging a code', async () => {
    const { service, writeToken } = setup();
    const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken');
    const { state } = await service.beginAuthorization();
    await expect(
      service.completeAuthorization(state, 'wrong-cookie', 'fake-code'),
    ).rejects.toThrow('expired');
    expect(exchange).not.toHaveBeenCalled();
    expect(writeToken).not.toHaveBeenCalled();
  });
  it('rejects expired state', async () => {
    const { service } = setup();
    const { state } = await service.beginAuthorization();
    const time = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(time + 601_000);
    await expect(
      service.completeAuthorization(state, state, 'fake-code'),
    ).rejects.toThrow('expired');
  });
  it('stores only the refresh token and verified identity, and consumes state once', async () => {
    const { service, writeToken } = setup();
    const exchange = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockImplementation(async () => ({
        tokens: {
          refresh_token: 'fake-refresh',
          access_token: 'fake-access',
          id_token: 'fake-identity',
          scope: `${GMAIL_SEND_SCOPE} ${GMAIL_METADATA_SCOPE}`,
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
    const { state } = await service.beginAuthorization();
    await service.completeAuthorization(state, state, 'fake-code');
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
    await expect(
      service.completeAuthorization(state, state, 'fake-code'),
    ).rejects.toThrow('expired');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('reuses a refresh token only for the same verified mailbox', async () => {
    const tokens = {
      read: vi.fn().mockResolvedValue({
        refreshToken: 'fake-existing',
        email: 'operator@example.com',
      }),
      write: vi.fn(),
    };
    const client = {
      authorization: vi.fn().mockResolvedValue({
        verifier: 'fake-verifier',
        url: 'https://example.com/oauth',
      }),
      exchange: vi.fn().mockResolvedValue({ email: 'operator@example.com' }),
      accessToken: vi.fn(),
      send: vi.fn(),
      thread: vi.fn(),
    };
    const service = new GmailService(client, tokens);
    const first = await service.beginAuthorization();
    await service.completeAuthorization(first.state, first.state, 'fake-code');
    expect(tokens.write).toHaveBeenCalledWith({
      refreshToken: 'fake-existing',
      email: 'operator@example.com',
    });

    client.exchange.mockResolvedValue({ email: 'different@example.com' });
    const second = await service.beginAuthorization();
    await expect(
      service.completeAuthorization(second.state, second.state, 'fake-code'),
    ).rejects.toThrow('Gmail connection failed');
    expect(tokens.write).toHaveBeenCalledTimes(1);
  });
});
