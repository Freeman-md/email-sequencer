import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { afterEach, expect, it, vi } from 'vitest';

import { GmailAuthorization } from '@/infrastructure/gmail/authorization';
import {
  GmailClient,
  GMAIL_SEND_SCOPE,
  GMAIL_METADATA_SCOPE,
} from '@/infrastructure/gmail/client';

function setup() {
  const client = new GmailClient(
    'test-client',
    () =>
      new OAuth2Client({
        clientId: 'test-client',
        clientSecret: 'synthetic-client-secret',
        redirectUri: 'http://localhost:3000/api/gmail/callback',
      }),
  );

  return new GmailAuthorization(client, () => Date.now());
}
afterEach(() => vi.restoreAllMocks());

it('requests required scopes, account selection, offline access, state and PKCE', async () => {
  const { url, state } = await setup().begin('recMailboxA');
  const params = new URL(url).searchParams;
  expect(params.get('scope')?.split(' ')).toEqual([
    GMAIL_SEND_SCOPE,
    GMAIL_METADATA_SCOPE,
    'openid',
    'email',
  ]);
  expect(params.get('access_type')).toBe('offline');
  expect(params.get('prompt')).toBe('consent select_account');
  expect(params.get('state')).toBe(state);
  expect(params.get('code_challenge_method')).toBe('S256');
  expect(params.get('code_challenge')).toBeTruthy();
});

it('rejects mismatched and expired state before exchanging any code', async () => {
  const authorization = setup();
  const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken');
  const { state } = await authorization.begin();
  await expect(
    authorization.complete(state, 'wrong-cookie', 'synthetic-code'),
  ).rejects.toThrow('expired');
  const time = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(time + 601_000);
  await expect(
    authorization.complete(state, state, 'synthetic-code'),
  ).rejects.toThrow('expired');
  expect(exchange).not.toHaveBeenCalled();
});

it('verifies identity and scopes, retains reconnect intent, and consumes state once', async () => {
  const exchange = vi
    .spyOn(OAuth2Client.prototype, 'getToken')
    .mockImplementation(async () => ({
      tokens: {
        refresh_token: 'synthetic-refresh',
        access_token: 'synthetic-access',
        id_token: 'synthetic-id',
        scope: `${GMAIL_SEND_SCOPE} ${GMAIL_METADATA_SCOPE}`,
      },
      res: null,
    }));
  vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(
    async () =>
      new LoginTicket('synthetic-envelope', {
        iss: 'https://accounts.google.com',
        sub: 'test-user',
        aud: 'test-client',
        iat: 1,
        exp: 9999999999,
        email: 'operator@example.com',
        email_verified: true,
      }),
  );
  const authorization = setup();
  const { state } = await authorization.begin('recMailboxA');
  expect(await authorization.complete(state, state, 'synthetic-code')).toEqual({
    email: 'operator@example.com',
    googleSubject: 'test-user',
    refreshToken: 'synthetic-refresh',
    mailboxId: 'recMailboxA',
  });
  await expect(
    authorization.complete(state, state, 'synthetic-code'),
  ).rejects.toThrow('expired');
  expect(exchange).toHaveBeenCalledTimes(1);
});

it.each(['identity', 'scope'])(
  'rejects missing verified %s',
  async (missing) => {
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(
      async () => ({
        tokens: {
          id_token: 'synthetic-id',
          scope:
            missing === 'scope'
              ? GMAIL_SEND_SCOPE
              : `${GMAIL_SEND_SCOPE} ${GMAIL_METADATA_SCOPE}`,
        },
        res: null,
      }),
    );
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(
      async () => new LoginTicket(),
    );
    const authorization = setup();
    const { state } = await authorization.begin();
    await expect(
      authorization.complete(state, state, 'synthetic-code'),
    ).rejects.toThrow('authorization failed');
  },
);
