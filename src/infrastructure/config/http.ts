import 'server-only';
import { appOrigin } from './env';

export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== appOrigin()) {
    throw new Error(
      'Request origin is not allowed. Open the app at the configured OAuth host.',
    );
  }
}

export function apiError(error: unknown, status = 400) {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'The operation could not be completed.',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
