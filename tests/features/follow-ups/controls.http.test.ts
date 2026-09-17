import { expect, it, vi } from 'vitest';

import { POST as prepare } from '@/app/api/follow-ups/prepare/route';
import { POST as stop } from '@/app/api/follow-ups/stop/route';

const service = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@/features/follow-ups/server', () => ({
  getFollowUpPreparationService: () => service,
}));
vi.mock('@/infrastructure/config/env', () => ({
  appOrigin: () => 'http://localhost:3000',
}));

it('validates limits, forwards unlimited runs and protects Stop with the same origin guard', async () => {
  const request = (body = '', origin = 'http://localhost:3000') =>
    new Request('http://localhost:3000/api/follow-ups/prepare', {
      method: 'POST',
      headers: { origin },
      body,
    });
  for (const limit of [0, -1, 1.5, '5', null])
    expect((await prepare(request(JSON.stringify({ limit })))).status).toBe(
      400,
    );
  expect(service.start).not.toHaveBeenCalled();
  service.start.mockReturnValue({ status: 'running' });
  expect((await prepare(request(JSON.stringify({ limit: 5 })))).status).toBe(
    202,
  );
  expect(service.start).toHaveBeenLastCalledWith(5);
  expect((await prepare(request())).status).toBe(202);
  expect(service.start).toHaveBeenLastCalledWith(undefined);
  expect((await stop(request('', 'https://elsewhere.example'))).status).toBe(
    400,
  );
  expect(service.stop).not.toHaveBeenCalled();
  service.stop.mockReturnValue({ status: 'stopping' });
  expect((await stop(request())).status).toBe(202);
  expect(service.stop).toHaveBeenCalledTimes(1);
});
