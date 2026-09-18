import { getSequencerServices } from '@/app/server/composition';
import { apiError } from '@/infrastructure/http/api-error';
import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';

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
