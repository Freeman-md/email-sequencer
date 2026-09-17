import { getFollowUpPreparationService } from '@/features/follow-ups/server';
import { apiError } from '@/infrastructure/http/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(getFollowUpPreparationService().snapshot(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return apiError(error, 503);
  }
}
