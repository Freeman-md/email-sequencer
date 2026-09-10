import { NextResponse } from 'next/server';
import { beginOAuth, OAUTH_COOKIE } from '@/infrastructure/gmail/oauth';
import { appOrigin } from '@/infrastructure/config/env';
import { apiError } from '@/infrastructure/config/http';
import { getRunner } from '@/features/sequencer/server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      throw new Error('Open Connect Gmail from the dashboard.');
    if (getRunner().isActive())
      throw new Error('Stop the run before changing the Gmail connection.');
    const { state, url } = await beginOAuth();
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
