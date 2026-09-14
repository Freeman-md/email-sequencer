import { afterEach, expect, it, vi } from 'vitest';

import { getFollowUpsService } from '@/features/follow-ups/server/composition';
import { getInfrastructure } from '@/infrastructure';

vi.mock('@/infrastructure', () => ({
  getInfrastructure: vi.fn(() => ({
    airtable: { request: vi.fn() },
    textGenerator: { generate: vi.fn() },
  })),
}));
const processState = globalThis as typeof globalThis & {
  emailSequencerFollowUps?: unknown;
};
afterEach(() => {
  delete processState.emailSequencerFollowUps;
  vi.clearAllMocks();
});

it('keeps an active pre-Stop instance locked and reports the required server restart', () => {
  const legacy = { snapshot: () => ({ status: 'running' }) };
  processState.emailSequencerFollowUps = legacy;
  expect(() => getFollowUpsService()).toThrow('Restart the development server');
  expect(processState.emailSequencerFollowUps).toBe(legacy);
  expect(getInfrastructure).not.toHaveBeenCalled();
});

it('upgrades an inactive pre-Stop instance once', () => {
  processState.emailSequencerFollowUps = {
    snapshot: () => ({ status: 'completed' }),
  };
  const service = getFollowUpsService();
  expect(typeof service.stop).toBe('function');
  expect(getFollowUpsService()).toBe(service);
  expect(getInfrastructure).toHaveBeenCalledTimes(1);
});
