import type { InteractionSummary, SentInteraction } from './interaction';

export type RunError = {
  kind: 'definite' | 'uncertain' | 'reconciliation' | 'system';
  message: string;
  interactionId?: string;
};
export type RunState = {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase:
    | 'idle'
    | 'fetching'
    | 'sending'
    | 'saving'
    | 'waiting'
    | 'stopping'
    | 'stopped';
  runStartedAt: string | null;
  finishedAt: string | null;
  intervalSeconds: number;
  sentCount: number;
  failureCount: number;
  nextSendAt: string | null;
  current: InteractionSummary | null;
  lastSent: SentInteraction | null;
  errors: RunError[];
};
