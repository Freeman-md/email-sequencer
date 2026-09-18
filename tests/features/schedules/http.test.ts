import { expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH, POST } from '@/app/api/schedules/route';

const service = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  status: vi.fn().mockResolvedValue({ selected: null }),
  create: vi.fn(),
  edit: vi.fn(),
  select: vi.fn(),
  automatic: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@/app/server/composition', () => ({
  getSequencerServices: () => ({ schedules: service }),
}));
vi.mock('@/infrastructure/config/env', () => ({
  appOrigin: () => 'http://localhost:3000',
}));
const request = (
  method: string,
  body: unknown,
  origin = 'http://localhost:3000',
) =>
  new Request('http://localhost:3000/api/schedules', {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

it('provides readable state and routes same-origin CRUD and selection commands', async () => {
  expect((await GET()).status).toBe(200);
  expect((await POST(request('POST', { name: 'Example' }))).status).toBe(201);
  expect(service.create).toHaveBeenCalledWith({ name: 'Example' });
  await PATCH(request('PATCH', { id: 'recSchedule', action: 'select' }));
  expect(service.select).toHaveBeenCalledWith('recSchedule');
  await PATCH(
    request('PATCH', {
      id: 'recSchedule',
      action: 'automatic',
      enabled: false,
    }),
  );
  expect(service.automatic).toHaveBeenCalledWith('recSchedule', false);
  await DELETE(request('DELETE', { id: 'recSchedule', confirmed: true }));
  expect(service.delete).toHaveBeenCalledWith('recSchedule', true);
});
it('blocks cross-origin writes and rejects malformed actions', async () => {
  const calls = service.create.mock.calls.length;
  expect(
    (await POST(request('POST', {}, 'https://attacker.example'))).status,
  ).toBe(400);
  expect(service.create).toHaveBeenCalledTimes(calls);
  expect(
    (await PATCH(request('PATCH', { id: 'recSchedule', action: 'unknown' })))
      .status,
  ).toBe(400);
});
