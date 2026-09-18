import { getSequencerServices } from '@/app/server/composition';
import { apiError } from '@/infrastructure/http/api-error';
import { requireSameOrigin } from '@/infrastructure/http/require-same-origin';

export const runtime = 'nodejs';
async function state() {
  const { schedules } = getSequencerServices();

  return {
    schedules: await schedules.list(),
    status: await schedules.status(),
  };
}
export async function GET() {
  try {
    return Response.json(await state());
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await getSequencerServices().schedules.create(await request.json());

    return Response.json(await state(), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !/^rec[a-zA-Z0-9]+$/.test(body.id) ||
      !('action' in body)
    ) {
      throw new Error('Provide a schedule ID and action.');
    }
    const { schedules } = getSequencerServices();
    if (body.action === 'select') {
      await schedules.select(body.id);
    } else if (
      body.action === 'automatic' &&
      'enabled' in body &&
      typeof body.enabled === 'boolean'
    ) {
      await schedules.automatic(body.id, body.enabled);
    } else if (body.action === 'edit' && 'configuration' in body) {
      await schedules.edit(body.id, body.configuration);
    } else {
      throw new Error('Unsupported schedule action.');
    }

    return Response.json(await state());
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
      !('id' in body) ||
      typeof body.id !== 'string'
    ) {
      throw new Error('Provide the schedule to delete.');
    }
    await getSequencerServices().schedules.delete(
      body.id,
      'confirmed' in body && body.confirmed === true,
    );

    return Response.json(await state());
  } catch (error) {
    return apiError(error);
  }
}
