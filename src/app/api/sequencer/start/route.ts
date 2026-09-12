import { getSequencerServices } from '@/features/sequencer/server';
import { apiError, requireSameOrigin } from '@/infrastructure/config/http';

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
