import { NextResponse } from 'next/server';

import { getSequencerServices } from '@/app/server/composition';
import { appOrigin } from '@/infrastructure/config/env';
import { OAUTH_COOKIE } from '@/infrastructure/gmail/authorization';
import { apiError } from '@/infrastructure/http/api-error';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      throw new Error('Open Connect Gmail from the dashboard.');
    if (getSequencerServices().sequencer.isActive())
      throw new Error('Stop the run before changing the Gmail connection.');
    const mailboxId =
      new URL(request.url).searchParams.get('mailboxId') ?? undefined;
    const { state, url } =
      await getSequencerServices().mailboxes.beginAuthorization(mailboxId);
    const response = NextResponse.redirect(url);
    response.cookies.set(OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: appOrigin().startsWith('https:'),
      sameSite: 'lax',
      maxAge: 600,
      path: '/api/gmail',
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
