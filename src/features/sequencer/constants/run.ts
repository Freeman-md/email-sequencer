import type { RunState } from '../types';

export const DEFAULT_INTERVAL_SECONDS = 300;
export const MAX_INTERVAL_SECONDS = 86_400;
export const POLL_INTERVAL_MS = 2_000;
export function initialRunState(): RunState {
  return {
    status: 'idle',
    phase: 'idle',
    runStartedAt: null,
    finishedAt: null,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    sentCount: 0,
    failureCount: 0,
    nextSendAt: null,
    current: null,
    lastSent: null,
    errors: [],
  };
}
