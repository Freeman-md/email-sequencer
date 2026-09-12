import 'server-only';

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
