import { getSequencerServices } from '@/app/server/composition';
import { apiError } from '@/infrastructure/http/api-error';
import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('intervalSeconds' in body) ||
      typeof body.intervalSeconds !== 'number'
    ) {
      throw new Error('Provide Interval Seconds as a number.');
    }

    return Response.json(
      getSequencerServices().sequencer.start(body.intervalSeconds),
      {
        status: 202,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
