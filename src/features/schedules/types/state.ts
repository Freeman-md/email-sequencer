import type { Schedule, ScheduleStatus } from '@/modules/outreach/schedules';

export type SchedulesState = { schedules: Schedule[]; status: ScheduleStatus };
