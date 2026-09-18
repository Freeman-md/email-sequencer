import 'server-only';
import { z } from 'zod';

import { recordSchema, recordsSchema } from '@/infrastructure/airtable/schemas';

import { SCHEDULE_TABLE, SCHEDULE_FIELDS } from './fields';
import { mapSchedule, scheduleFields } from './schedule.mapper';

import type { IScheduleRepository } from '../interfaces/schedule-repository.interface';
import type { Schedule, ScheduleConfiguration } from '../types';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class ScheduleRepository implements IScheduleRepository {
  constructor(private readonly client: IAirtableClient) {}

  async list() {
    const schedules: Schedule[] = [];
    const seen = new Set<string>();
    let offset: string | undefined;
    do {
      const data = recordsSchema.parse(
        await this.client.request(`${SCHEDULE_TABLE}/listRecords`, {
          method: 'POST',
          body: JSON.stringify({
            pageSize: 100,
            fields: Object.values(SCHEDULE_FIELDS),
            ...(offset ? { offset } : {}),
          }),
        }),
      );
      schedules.push(...data.records.map(mapSchedule));
      offset = data.offset;
      if (offset && seen.has(offset)) {
        throw new Error(
          'Schedules pagination repeated. Repair Airtable access before sending.',
        );
      }
      if (offset) {
        seen.add(offset);
      }
    } while (offset);
    if (
      new Set(schedules.map((schedule) => schedule.id)).size !==
      schedules.length
    ) {
      throw new Error('Duplicate schedule records returned. Sending blocked.');
    }

    return schedules;
  }

  async create(configuration: ScheduleConfiguration) {
    const expected = {
      ...configuration,
      selected: false,
      automaticSending: false,
      lastTriggerKey: '',
    };
    const saved = mapSchedule(
      recordSchema.parse(
        await this.client.request(SCHEDULE_TABLE, {
          method: 'POST',
          body: JSON.stringify({ fields: scheduleFields(expected) }),
        }),
      ),
    );
    this.verify(saved, expected);

    return saved;
  }

  async update(id: string, changes: Partial<Schedule>) {
    const saved = mapSchedule(
      recordSchema.parse(
        await this.client.request(
          `${SCHEDULE_TABLE}/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ fields: scheduleFields(changes) }),
          },
        ),
      ),
    );
    if (saved.id !== id) {
      throw new Error(
        'Schedule update identity was not confirmed. Repair Airtable before sending.',
      );
    }
    this.verify(saved, changes);
  }

  async delete(id: string) {
    const data = z.object({ id: z.string(), deleted: z.literal(true) }).parse(
      await this.client.request(`${SCHEDULE_TABLE}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    );
    if (data.id !== id || data.deleted !== true) {
      throw new Error(
        'Schedule deletion was not confirmed. Refresh Airtable; do not retry blindly.',
      );
    }
  }

  private verify(saved: Schedule, changes: Partial<Schedule>) {
    if (
      Object.entries(changes).some(([key, value]) => {
        if (key === 'days' && Array.isArray(value)) {
          return [...saved.days].sort().join() !== [...value].sort().join();
        }

        return (
          JSON.stringify(saved[key as keyof Schedule]) !== JSON.stringify(value)
        );
      })
    ) {
      throw new Error(
        'Schedule write was not confirmed. Repair Airtable configuration before sending.',
      );
    }
  }
}
