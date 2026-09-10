import { timingSafeEqual, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password || password.length < 16) {
    return new NextResponse(
      'Configure APP_PASSWORD with at least 16 characters before opening the app.',
      { status: 503 },
    );
  }
  const header = request.headers.get('authorization') ?? '';
  const actual = header.startsWith('Basic ')
    ? Buffer.from(header.slice(6), 'base64').toString('utf8')
    : '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(actual), digest(`operator:${password}`))) {
    return new NextResponse('Operator authentication required.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Email Sequencer", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
