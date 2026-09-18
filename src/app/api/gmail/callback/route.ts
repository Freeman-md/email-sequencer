import { NextResponse } from 'next/server';

import { getSequencerServices } from '@/app/server/composition';
import { MailboxReconnectMismatchError } from '@/features/mailboxes/server/service';
import { ConnectionChangeBlockedError } from '@/features/sequencer/server/runtime/sequencer-runtime';
import { appOrigin } from '@/infrastructure/config/env';
import { OAUTH_COOKIE } from '@/infrastructure/gmail/authorization';

import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  let outcome = 'connected';

  try {
    const params = request.nextUrl.searchParams;
    if (params.has('error')) throw new Error('Authorization declined');
    await getSequencerServices().mailboxes.completeAuthorization(
      params.get('state') ?? '',
      request.cookies.get(OAUTH_COOKIE)?.value,
      params.get('code') ?? '',
    );
    getSequencerServices().connections.invalidate();
  } catch (error) {
    outcome = 'failed';
    if (error instanceof MailboxReconnectMismatchError) {
      outcome = 'wrong-account';
    }
    if (error instanceof ConnectionChangeBlockedError) {
      outcome = 'run-active';
    }
  }
  const response = NextResponse.redirect(
    new URL(`/?gmail=${outcome}`, appOrigin()),
  );
  response.cookies.set(OAUTH_COOKIE, '', { maxAge: 0, path: '/api/gmail' });

  return response;
}
