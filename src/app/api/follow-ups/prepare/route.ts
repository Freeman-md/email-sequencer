import { getFollowUpsService } from '@/features/follow-ups/server';
import { apiError } from '@/infrastructure/http/api-error';
import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);

    return Response.json(getFollowUpsService().start(), {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return apiError(error);
  }
}
