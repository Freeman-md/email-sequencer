import { getSequencerServices } from '@/features/sequencer/server';
import { apiError } from '@/infrastructure/http/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(
      await getSequencerServices().sequencer.getDashboardState(),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return apiError(error, 503);
  }
}
