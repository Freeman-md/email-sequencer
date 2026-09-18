import type { ConnectionState } from './connection';
import type { RunState } from './run';
import type { SendAttempt } from '@/infrastructure/send-attempts/store';
import type { ScheduleStatus } from '@/modules/outreach/schedules';

export type DashboardState = ConnectionState & {
  run: RunState;
  serverNow: string;
  pendingAttempt: SendAttempt | null;
  schedule: ScheduleStatus;
};
