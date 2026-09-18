import type { DashboardState, RunState } from '../../types';

export interface ISequencerClient {
  getState(signal: AbortSignal): Promise<DashboardState>;
  start(intervalSeconds: number, signal: AbortSignal): Promise<RunState>;
  stop(signal: AbortSignal): Promise<RunState>;
  reconcile(
    attemptId: string,
    outcome: 'sent' | 'not-sent',
    signal: AbortSignal,
  ): Promise<DashboardState>;
}
