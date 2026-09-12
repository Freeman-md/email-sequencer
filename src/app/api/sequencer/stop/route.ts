import { getSequencerServices } from '@/features/sequencer/server';
import { apiError, requireSameOrigin } from '@/infrastructure/config/http';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);

    return Response.json(getSequencerServices().sequencer.stop(), {
      status: 202,
    });
  } catch (error) {
    return apiError(error);
  }
}
