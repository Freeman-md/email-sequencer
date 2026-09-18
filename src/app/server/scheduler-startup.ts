import 'server-only';
import { getSequencerServices } from './composition';

const state = globalThis as typeof globalThis & {
  emailSchedulerStarted?: boolean;
};
export function startProductionScheduler() {
  if (state.emailSchedulerStarted) {
    return;
  }
  try {
    const { scheduler } = getSequencerServices();
    scheduler.start();
    state.emailSchedulerStarted = true;
  } catch {
    console.error(
      'Email scheduling failed to initialize. Check server configuration and restart; schedule management remains available.',
    );
  }
}
