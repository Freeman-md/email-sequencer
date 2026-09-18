import type { ConnectionState } from './connection';
import type { RunState } from './run';
import type { SendAttempt } from '@/infrastructure/send-attempts/store';

export type DashboardState = ConnectionState & {
  run: RunState;
  serverNow: string;
  pendingAttempt: SendAttempt | null;
};
