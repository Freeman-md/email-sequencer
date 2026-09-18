import { z } from 'zod';

import { textField } from '@/infrastructure/airtable/record-fields';

import { WEEKDAYS } from '../types';

import { SCHEDULE_FIELDS as field } from './fields';

import type { Schedule } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapSchedule(record: AirtableRecord): Schedule {
  return {
    id: record.id,
    name: textField(record, field.name),
    days: z.array(z.enum(WEEKDAYS)).parse(record.fields[field.days] ?? []),
    opensAt: textField(record, field.opensAt),
    closesAt: textField(record, field.closesAt),
    timezone: textField(record, field.timezone),
    intervalSeconds: z
      .number()
      .parse(record.fields[field.intervalSeconds] ?? 0),
    selected: z.boolean().parse(record.fields[field.selected] ?? false),
    automaticSending: z
      .boolean()
      .parse(record.fields[field.automaticSending] ?? false),
    lastTriggerKey: textField(record, field.lastTriggerKey),
  };
}
export function scheduleFields(changes: Partial<Schedule>) {
  return Object.fromEntries(
    Object.entries(changes)
      .filter(([key]) => key in field)
      .map(([key, value]) => [field[key as keyof typeof field], value]),
  );
}
