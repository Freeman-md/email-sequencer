import 'server-only';
import { randomBytes } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { getConfig } from '@/infrastructure/config/env';
import { readToken, writeToken } from './token-store';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const OAUTH_COOKIE = 'gmail_oauth_state';
const globalOAuth = globalThis as typeof globalThis & {
  gmailOAuthPending?: Map<string, { verifier: string; expires: number }>;
};
const pending = (globalOAuth.gmailOAuthPending ??= new Map());

export function createOAuthClient() {
  const config = getConfig();
  return new OAuth2Client({
    clientId: config.EMAIL_SEQUENCER_GOOGLE_CLIENT_ID,
    clientSecret: config.EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET,
    redirectUri: config.EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI,
    transporterOptions: { timeout: 20_000, retry: false },
  });
}

export async function beginOAuth() {
  const now = Date.now();
  for (const [key, value] of pending)
    if (value.expires < now) pending.delete(key);
  if (pending.size >= 20)
    throw new Error(
      'Too many pending Gmail connections. Wait ten minutes and try again.',
    );
  const client = createOAuthClient();
  const state = randomBytes(32).toString('base64url');
  const codes = await client.generateCodeVerifierAsync();
  pending.set(state, { verifier: codes.codeVerifier, expires: now + 600_000 });
  return {
    state,
    url: client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [GMAIL_SEND_SCOPE, 'openid', 'email'],
      state,
      code_challenge: codes.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  };
}

export async function finishOAuth(
  state: string,
  cookie: string | undefined,
  code: string,
) {
  const entry = pending.get(state);
  if (!entry || cookie !== state || entry.expires < Date.now())
    throw new Error('Gmail connection expired. Connect Gmail again.');
  pending.delete(state);
  const client = createOAuthClient();
  try {
    const { tokens } = await client.getToken({
      code,
      codeVerifier: entry.verifier,
    });
    if (
      !tokens.id_token ||
      !tokens.scope?.split(' ').includes(GMAIL_SEND_SCOPE)
    )
      throw new Error('Missing permissions');
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: getConfig().EMAIL_SEQUENCER_GOOGLE_CLIENT_ID,
    });
    const identity = ticket.getPayload();
    if (!identity?.email || !identity.email_verified)
      throw new Error('No verified email');
    const previous = await readToken();
    const refreshToken =
      tokens.refresh_token ??
      (previous?.email === identity.email ? previous.refreshToken : undefined);
    if (!refreshToken) throw new Error('No offline access');
    await writeToken({ refreshToken, email: identity.email });
  } catch {
    throw new Error(
      'Gmail connection failed. Grant send permission and offline access, and check OAuth configuration and token file permissions.',
    );
  }
}

export async function gmailConnection() {
  const stored = await readToken();
  if (!stored) return { connected: false, detail: 'Connect once via OAuth' };
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: stored.refreshToken });
  try {
    const result = await client.getAccessToken();
    if (!result.token) throw new Error('Missing access');
    return { connected: true, detail: stored.email };
  } catch {
    return {
      connected: false,
      detail:
        'Gmail authorization expired or unavailable. Connect Gmail again.',
    };
  }
}

export async function gmailAccessToken() {
  const stored = await readToken();
  if (!stored) throw new Error('Connect Gmail before sending.');
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: stored.refreshToken });
  const result = await client.getAccessToken();
  if (!result.token) throw new Error('Gmail authorization is unavailable.');
  return result.token;
}
