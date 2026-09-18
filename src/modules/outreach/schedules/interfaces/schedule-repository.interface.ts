import type { Schedule, ScheduleConfiguration, ScheduleStatus } from '../types';

export interface IScheduleRepository {
  list(): Promise<Schedule[]>;
  create(configuration: ScheduleConfiguration): Promise<Schedule>;
  update(id: string, changes: Partial<Schedule>): Promise<void>;
  delete(id: string): Promise<void>;
}
export interface ISendingSchedule {
  capture(): Promise<Schedule>;
  verify(schedule: Schedule): Promise<void>;
  status(): Promise<ScheduleStatus>;
  claim(schedule: Schedule, key: string): Promise<void>;
}
