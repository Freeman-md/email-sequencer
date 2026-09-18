import type { SchedulesState } from '../../types/state';
import type { ScheduleConfiguration } from '@/modules/outreach/schedules';

export type ScheduleCommand =
  | { action: 'select'; id: string }
  | { action: 'automatic'; id: string; enabled: boolean }
  | { action: 'edit'; id: string; configuration: ScheduleConfiguration };
export interface ISchedulesClient {
  getState(signal: AbortSignal): Promise<SchedulesState>;
  create(
    configuration: ScheduleConfiguration,
    signal: AbortSignal,
  ): Promise<SchedulesState>;
  change(
    command: ScheduleCommand,
    signal: AbortSignal,
  ): Promise<SchedulesState>;
  delete(id: string, signal: AbortSignal): Promise<SchedulesState>;
}
