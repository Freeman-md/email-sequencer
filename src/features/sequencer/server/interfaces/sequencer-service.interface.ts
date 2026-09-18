import type { DashboardState, RunState } from '../../types';

export interface ISequencerService {
  snapshot(): RunState;
  isActive(): boolean;
  getDashboardState(): Promise<DashboardState>;
  start(): RunState;
  stop(): RunState;
}
