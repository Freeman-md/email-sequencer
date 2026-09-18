export async function register() {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.EMAIL_SEQUENCER_SCHEDULER_DISABLED === '1'
  ) {
    return;
  }
  const { startProductionScheduler } =
    await import('./app/server/scheduler-startup');
  startProductionScheduler();
}
