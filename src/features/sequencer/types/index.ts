export type Interaction = {
  id: string;
  prospect: string;
  company: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
};
export type InteractionSummary = Omit<Interaction, 'message'>;
export type SentInteraction = InteractionSummary & { sentAt: string };
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
export type Connection = { connected: boolean; detail: string };
export type DashboardState = {
  run: RunState;
  airtable: Connection;
  gmail: Connection;
  serverNow: string;
};
