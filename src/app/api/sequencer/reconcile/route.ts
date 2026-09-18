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
      !('attemptId' in body) ||
      typeof body.attemptId !== 'string' ||
      !('outcome' in body) ||
      (body.outcome !== 'sent' && body.outcome !== 'not-sent') ||
      !('verified' in body) ||
      body.verified !== true
    ) {
      throw new Error(
        'Explicitly verify the particular send attempt and provide sent or not-sent as its outcome.',
      );
    }
    await getSequencerServices().sequencer.reconcile(
      body.attemptId,
      body.outcome,
    );

    return Response.json(
      await getSequencerServices().sequencer.getDashboardState(),
    );
  } catch (error) {
    return apiError(error);
  }
}
