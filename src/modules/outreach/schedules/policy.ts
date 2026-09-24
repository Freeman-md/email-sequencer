import { z } from 'zod';

import { WEEKDAYS } from './types';

import type { Schedule, ScheduleConfiguration } from './types';

const localTime = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use local time HH:mm.');

export const scheduleConfigurationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    days: z
      .array(z.enum(WEEKDAYS))
      .min(1)
      .refine((days) => new Set(days).size === days.length),
    opensAt: localTime,
    closesAt: localTime,
    timezone: z.string().refine((timezone) => {
      if (!/^(?:UTC|GMT|[A-Za-z_]+\/[A-Za-z0-9_+\-/]+)$/.test(timezone)) {
        return false;
      }

      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });

        return true;
      } catch {
        return false;
      }
    }, 'Use a valid IANA timezone.'),
    intervalSeconds: z.number().int().min(1).max(86400),
  })
  .strict()
  .refine(
    (schedule) => schedule.opensAt < schedule.closesAt,
    'Opening must be before closing; overnight windows are not supported.',
  );

export function validateSchedule(value: unknown): ScheduleConfiguration {
  const result = scheduleConfigurationSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid schedule: ${result.error.issues.map((issue) => issue.message).join(' ')}`,
    );
  }

  return result.data;
}

export function selectedSchedule(schedules: Schedule[]): Schedule {
  const selected = schedules.filter((schedule) => schedule.selected);
  if (selected.length !== 1) {
    throw new Error(
      selected.length
        ? 'Multiple schedules are selected. Repair Selected in Airtable before sending.'
        : 'No schedule is selected. Select a sending schedule before starting.',
    );
  }
  const schedule = selected[0]!;
  const { name, days, opensAt, closesAt, timezone, intervalSeconds } = schedule;
  validateSchedule({
    name,
    days,
    opensAt,
    closesAt,
    timezone,
    intervalSeconds,
  });

  return schedule;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(now: Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );

  return {
    weekday: parts.weekday as (typeof WEEKDAYS)[number],
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function scheduleLocalDate(schedule: Schedule, now: Date): string {
  return localParts(now, schedule.timezone).date;
}

export function windowOpen(schedule: Schedule, now: Date): boolean {
  const local = localParts(now, schedule.timezone);

  return (
    schedule.days.includes(local.weekday) &&
    local.time >= schedule.opensAt &&
    local.time < schedule.closesAt
  );
}
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function isRepeatedLocalMinute(schedule: Schedule, now: Date) {
  const minute = Math.floor(now.getTime() / 60000) * 60000;
  const local = localParts(now, schedule.timezone);
  const offset = Date.parse(`${local.date}T${local.time}:00Z`) - minute;
  // This is an elapsed look-back to discover the preceding offset, not a local
  // day calculation. Only identical wall-clock minutes count as a repeated time.
  const earlier = minute - 36 * 3600000;
  const previous = localParts(new Date(earlier), schedule.timezone);
  const previousOffset =
    Date.parse(`${previous.date}T${previous.time}:00Z`) - earlier;
  const offsetChange = previousOffset - offset;
  if (offsetChange <= 0) {
    return false;
  }
  const first = localParts(new Date(minute - offsetChange), schedule.timezone);

  return first.date === local.date && first.time === local.time;
}

export function triggerKey(schedule: Schedule, now: Date): string | null {
  const local = localParts(now, schedule.timezone);
  if (
    !windowOpen(schedule, now) ||
    isRepeatedLocalMinute(schedule, now) ||
    (minutes(local.time) - minutes(schedule.opensAt)) % 60 !== 0
  ) {
    return null;
  }

  return `${schedule.id}:${local.date}:${local.time}`;
}
export function nextTrigger(schedule: Schedule, after: Date): Date | null {
  if (!schedule.automaticSending) {
    return null;
  }
  const start = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  // Walk real minutes: nonexistent local times never appear, and a repeated local
  // occurrence already claimed by this schedule must not run twice.
  for (let instant = start; instant < start + 8 * 86400000; instant += 60000) {
    const candidate = new Date(instant);
    const key = triggerKey(schedule, candidate);
    if (key && key !== schedule.lastTriggerKey) {
      return candidate;
    }
  }

  return null;
}
export function windowClosesAt(schedule: Schedule, now: Date): Date {
  if (!windowOpen(schedule, now)) {
    return now;
  }
  let instant = Math.floor(now.getTime() / 60000) * 60000 + 60000;
  while (windowOpen(schedule, new Date(instant))) {
    instant += 60000;
  }

  return new Date(instant);
}
export function sameOperationalSchedule(a: Schedule, b: Schedule): boolean {
  return (
    a.id === b.id &&
    a.opensAt === b.opensAt &&
    a.closesAt === b.closesAt &&
    a.timezone === b.timezone &&
    a.intervalSeconds === b.intervalSeconds &&
    [...a.days].sort().join() === [...b.days].sort().join()
  );
}
