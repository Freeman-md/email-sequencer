export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type ScheduleConfiguration = {
  name: string;
  days: Weekday[];
  opensAt: string;
  closesAt: string;
  timezone: string;
  intervalSeconds: number;
};
export type Schedule = ScheduleConfiguration & {
  id: string;
  selected: boolean;
  automaticSending: boolean;
  lastTriggerKey: string;
};
export const NEW_SCHEDULE_DEFAULTS: ScheduleConfiguration = {
  name: '',
  days: WEEKDAYS.slice(0, 5),
  opensAt: '09:00',
  closesAt: '17:00',
  timezone: 'Europe/London',
  intervalSeconds: 1200,
};
export type ScheduleStatus = {
  selected: Schedule | null;
  windowOpen: boolean;
  nextTriggerAt: string | null;
  error: string | null;
  schedulerError: string | null;
};
