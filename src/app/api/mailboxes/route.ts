import { getSequencerServices } from '@/app/server/composition';
import { apiError } from '@/infrastructure/http/api-error';
import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return Response.json(await getSequencerServices().mailboxes.getState());
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('mailboxId' in body) ||
      typeof body.mailboxId !== 'string'
    ) {
      throw new Error('Provide the mailbox record ID to disconnect.');
    }
    const services = getSequencerServices();
    await services.mailboxes.disconnect(body.mailboxId);
    services.connections.invalidate();

    return Response.json(await services.mailboxes.getState());
  } catch (error) {
    return apiError(error);
  }
}
