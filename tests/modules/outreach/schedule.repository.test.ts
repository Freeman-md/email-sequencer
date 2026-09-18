import { expect, it, vi } from 'vitest';

import { NEW_SCHEDULE_DEFAULTS } from '@/modules/outreach/schedules';
import { ScheduleRepository } from '@/modules/outreach/schedules/airtable/schedule.repository';

const configuration = { ...NEW_SCHEDULE_DEFAULTS, name: 'Weekdays' };
const fields = {
  Name: 'Weekdays',
  Days: configuration.days,
  'Opens At': '09:00',
  'Closes At': '17:00',
  Timezone: 'Europe/London',
  'Interval Seconds': 1200,
  Selected: false,
  'Automatic Sending': false,
  'Last Trigger Key': '',
};
it('creates with safe defaults and confirms provider writes including claims', async () => {
  const request = vi.fn().mockResolvedValue({ id: 'recSchedule', fields });
  const repository = new ScheduleRepository({ request });
  expect(await repository.create(configuration)).toMatchObject({
    id: 'recSchedule',
    intervalSeconds: 1200,
    selected: false,
    automaticSending: false,
  });
  expect(JSON.parse(request.mock.calls[0]?.[1].body).fields).toEqual(fields);
  request.mockResolvedValueOnce({
    id: 'recSchedule',
    fields: { ...fields, 'Last Trigger Key': 'claimed' },
  });
  await repository.update('recSchedule', { lastTriggerKey: 'claimed' });
  await expect(
    repository.update('recSchedule', { lastTriggerKey: 'other' }),
  ).rejects.toThrow('not confirmed');
});
it('pages schedules with repeated-page protection and confirms deletion identity', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      records: [{ id: 'recFirst', fields }],
      offset: 'next',
    })
    .mockResolvedValueOnce({ records: [{ id: 'recSecond', fields }] });
  const repository = new ScheduleRepository({ request });
  expect(await repository.list()).toHaveLength(2);
  expect(JSON.parse(request.mock.calls[1]?.[1].body).offset).toBe('next');
  request.mockResolvedValue({ records: [], offset: 'repeat' });
  await expect(repository.list()).rejects.toThrow('repeated');
  request.mockResolvedValueOnce({ id: 'recFirst', deleted: true });
  await repository.delete('recFirst');
  request.mockResolvedValueOnce({ id: 'recWrong', deleted: true });
  await expect(repository.delete('recFirst')).rejects.toThrow('not confirmed');
});
