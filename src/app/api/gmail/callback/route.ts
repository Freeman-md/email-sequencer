import { NextResponse } from 'next/server';

import { getSequencerServices } from '@/features/sequencer/server';
import { appOrigin } from '@/infrastructure/config/env';
import { OAUTH_COOKIE } from '@/infrastructure/gmail/service';

import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  let outcome = 'connected';

  try {
    const params = request.nextUrl.searchParams;
    if (params.has('error')) throw new Error('Authorization declined');
    await getSequencerServices().connections.connectGmail(
      params.get('state') ?? '',
      request.cookies.get(OAUTH_COOKIE)?.value,
      params.get('code') ?? '',
    );
  } catch {
    outcome = 'failed';
  }
  const response = NextResponse.redirect(
    new URL(`/?gmail=${outcome}`, appOrigin()),
  );
  response.cookies.set(OAUTH_COOKIE, '', { maxAge: 0, path: '/api/gmail' });

  return response;
}
