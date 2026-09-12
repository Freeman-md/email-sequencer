import type { ConnectionState } from './connection';
import type { RunState } from './run';

export type DashboardState = ConnectionState & {
  run: RunState;
  serverNow: string;
};
