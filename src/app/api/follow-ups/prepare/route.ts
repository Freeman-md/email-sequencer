import { z } from 'zod';

import { getFollowUpPreparationService } from '@/features/follow-ups/server';
import { apiError } from '@/infrastructure/http/api-error';
import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);

    const body = await request.text();
    const parsed = z
      .object({ limit: z.number().int().positive().optional() })
      .safeParse(body.trim() ? JSON.parse(body) : {});
    if (!parsed.success)
      throw new Error(
        'Preparation limit must be a positive whole number, or left blank.',
      );

    return Response.json(
      getFollowUpPreparationService().start(parsed.data.limit),
      {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
