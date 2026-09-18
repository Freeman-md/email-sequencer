import { afterEach, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => vi.fn());
vi.mock('@/app/server/composition', () => ({
  getSequencerServices: () => ({ scheduler: { start } }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  start.mockClear();
  delete (globalThis as typeof globalThis & { emailSchedulerStarted?: boolean })
    .emailSchedulerStarted;
});

it('initializes from Node instrumentation in production without an HTTP request and only once', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NEXT_PHASE', 'phase-production-server');
  vi.stubEnv('EMAIL_SEQUENCER_SCHEDULER_DISABLED', '0');
  const { register } = await import('@/instrumentation');
  await register();
  await register();
  expect(start).toHaveBeenCalledTimes(1);
});
it.each(['development', 'test', 'build', 'disabled'])(
  'cannot initialize automatic work during %s',
  async (mode) => {
    vi.stubEnv(
      'NODE_ENV',
      mode === 'development' || mode === 'test' ? mode : 'production',
    );
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv(
      'NEXT_PHASE',
      mode === 'build' ? 'phase-production-build' : 'phase-production-server',
    );
    vi.stubEnv(
      'EMAIL_SEQUENCER_SCHEDULER_DISABLED',
      mode === 'disabled' ? '1' : '0',
    );
    const { register } = await import('@/instrumentation');
    await register();
    expect(start).not.toHaveBeenCalled();
  },
);
