import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SendingScheduler } from '@/app/server/scheduler';
import { SchedulesService } from '@/features/schedules/server/service';
import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';
import {
  NEW_SCHEDULE_DEFAULTS,
  WEEKDAYS,
  nextTrigger,
  selectedSchedule,
  triggerKey,
  validateSchedule,
  windowOpen,
} from '@/modules/outreach/schedules';

import type { Schedule } from '@/modules/outreach/schedules';

const configuration = { ...NEW_SCHEDULE_DEFAULTS, name: 'Weekdays' };
const selected: Schedule = {
  ...configuration,
  id: 'recScheduleA',
  selected: true,
  automaticSending: false,
  lastTriggerKey: '',
};
function setup() {
  let records = structuredClone([
    selected,
    { ...selected, id: 'recScheduleB', selected: false },
  ]);
  const repository = {
    list: vi.fn(async () => structuredClone(records)),
    create: vi.fn(async (config) => {
      const record = {
        ...config,
        id: 'recNew',
        selected: false,
        automaticSending: false,
        lastTriggerKey: '',
      };
      records.push(record);

      return record;
    }),
    update: vi.fn(async (id: string, changes: Partial<Schedule>) => {
      Object.assign(
        records.find((record) => record.id === id)!,
        changes,
      );
    }),
    delete: vi.fn(async (id: string) => {
      records = records.filter((record) => record.id !== id);
    }),
  };
  const runtime = new SequencerRuntime();
  const service = new SchedulesService(repository, runtime);

  return { service, repository, runtime };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T07:59:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('schedule policy', () => {
  it.each([
    { days: [] },
    { opensAt: '9:00' },
    { closesAt: '09:00' },
    { opensAt: '18:00', closesAt: '08:00' },
    { timezone: 'not/a/zone' },
    { intervalSeconds: 0 },
    { intervalSeconds: 86401 },
    { intervalSeconds: 1.5 },
  ])('rejects invalid configuration %s', (changes) => {
    expect(() => validateSchedule({ ...configuration, ...changes })).toThrow(
      'Invalid schedule',
    );
  });
  it('keeps the 20-minute new default and existing explicit intervals', () => {
    expect(NEW_SCHEDULE_DEFAULTS.intervalSeconds).toBe(1200);
    expect(
      validateSchedule({ ...configuration, intervalSeconds: 300 })
        .intervalSeconds,
    ).toBe(300);
  });
  it('supports Lord Howe half-hour DST changes without fixed offsets', () => {
    const schedule = {
      ...selected,
      days: [...WEEKDAYS],
      timezone: 'Australia/Lord_Howe',
      opensAt: '01:30',
      closesAt: '04:00',
      automaticSending: true,
    };
    expect(triggerKey(schedule, new Date('2026-04-04T14:30:00Z'))).toBe(
      'recScheduleA:2026-04-05:01:30',
    );
    expect(triggerKey(schedule, new Date('2026-04-04T15:00:00Z'))).toBeNull();
    expect(
      nextTrigger(schedule, new Date('2026-04-04T14:30:00Z'))?.toISOString(),
    ).toBe('2026-04-04T16:00:00.000Z');
  });
  it('requires exactly one valid selected record', () => {
    expect(() => selectedSchedule([])).toThrow('No schedule');
    expect(() =>
      selectedSchedule([selected, { ...selected, id: 'recOther' }]),
    ).toThrow('Multiple');
    expect(() => selectedSchedule([{ ...selected, days: [] }])).toThrow(
      'Invalid',
    );
  });
  it('uses weekdays, timezone conversion and exclusive closing', () => {
    expect(windowOpen(selected, new Date('2026-09-21T08:00:00Z'))).toBe(true);
    expect(windowOpen(selected, new Date('2026-09-21T16:00:00Z'))).toBe(false);
    expect(windowOpen(selected, new Date('2026-09-20T12:00:00Z'))).toBe(false);
  });
  it('triggers hourly from a non-whole-hour opening, never after closing', () => {
    const schedule = { ...selected, opensAt: '09:30', automaticSending: true };
    expect(triggerKey(schedule, new Date('2026-09-21T08:30:42Z'))).toBe(
      'recScheduleA:2026-09-21:09:30',
    );
    expect(triggerKey(schedule, new Date('2026-09-21T09:00:00Z'))).toBeNull();
    expect(
      nextTrigger(schedule, new Date('2026-09-21T15:30:00Z'))?.toISOString(),
    ).toBe('2026-09-22T08:30:00.000Z');
  });
  it('skips nonexistent DST trigger times and uses one key for repeated times', () => {
    const schedule = {
      ...selected,
      days: [...WEEKDAYS],
      opensAt: '00:30',
      closesAt: '04:00',
      automaticSending: true,
    };
    expect(
      nextTrigger(schedule, new Date('2026-03-29T00:30:00Z'))?.toISOString(),
    ).toBe('2026-03-29T01:30:00.000Z');
    const key = triggerKey(schedule, new Date('2026-10-25T00:30:00Z'));
    expect(triggerKey(schedule, new Date('2026-10-25T01:30:00Z'))).toBeNull();
    expect(
      nextTrigger(
        { ...schedule, lastTriggerKey: key! },
        new Date('2026-10-25T00:30:00Z'),
      )?.toISOString(),
    ).toBe('2026-10-25T02:30:00.000Z');
  });
});

describe('schedule management and claims', () => {
  it('creates off/unselected, edits, selects exclusively and confirms deletion', async () => {
    const { service, repository } = setup();
    expect(await service.create(configuration)).toMatchObject({
      intervalSeconds: 1200,
      selected: false,
      automaticSending: false,
    });
    await service.edit('recNew', { ...configuration, intervalSeconds: 600 });
    await service.select('recNew');
    expect((await service.capture()).id).toBe('recNew');
    expect(() => service.delete('recNew', false)).toThrow('Confirm');
    await service.delete('recNew', true);
    expect((await service.status()).selected).toBeNull();
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });
  it('applies backend defaults without enabling or selecting a new schedule', async () => {
    const { service } = setup();
    expect(await service.create({ name: 'New window' })).toMatchObject({
      ...NEW_SCHEDULE_DEFAULTS,
      name: 'New window',
      selected: false,
      automaticSending: false,
    });
  });
  it('serializes concurrent selections', async () => {
    const { service } = setup();
    await Promise.all([
      service.select('recScheduleB'),
      service.select('recScheduleA'),
    ]);
    expect((await service.capture()).id).toBe('recScheduleA');
  });
  it('fails closed on partial selection writes until explicit repair', async () => {
    const { service, repository } = setup();
    repository.update.mockRejectedValueOnce(
      new Error('Synthetic write failure'),
    );
    await expect(service.select('recScheduleB')).rejects.toThrow(
      'not confirmed',
    );
    await expect(service.capture()).rejects.toThrow('Sending blocked');
    await service.select('recScheduleA');
    expect((await service.capture()).id).toBe('recScheduleA');
  });
  it('blocks duplicate selections, malformed selection and read failures', async () => {
    const { service, repository } = setup();
    repository.list.mockResolvedValueOnce([
      selected,
      { ...selected, id: 'recDuplicate' },
    ]);
    expect((await service.status()).error).toContain('Multiple');
    repository.list.mockResolvedValueOnce([{ ...selected, opensAt: 'bad' }]);
    expect((await service.status()).selected).toBeNull();
    repository.list.mockRejectedValueOnce(new Error('private upstream'));
    expect((await service.status()).error).toContain('could not be read');
  });
  it('protects selected configuration during runs but allows disabling automatic starts and managing unselected records', async () => {
    const { service, runtime } = setup();
    runtime.begin(1200);
    await expect(service.edit('recScheduleA', configuration)).rejects.toThrow(
      'Stop',
    );
    await expect(service.select('recScheduleB')).rejects.toThrow('Stop');
    await expect(service.delete('recScheduleA', true)).rejects.toThrow('Stop');
    await service.automatic('recScheduleA', false);
    await service.edit('recScheduleB', configuration);
    expect(runtime.isActive()).toBe(true);
  });
  it('confirms durable claims, rejects replay and never retries ambiguous writes', async () => {
    const { service, repository } = setup();
    await service.automatic('recScheduleA', true);
    const schedule = await service.capture();
    await service.claim(schedule, 'occurrence1');
    expect((await service.capture()).lastTriggerKey).toBe('occurrence1');
    await expect(service.claim(schedule, 'occurrence1')).rejects.toThrow(
      'already claimed',
    );
    repository.update.mockRejectedValueOnce(new Error('unknown write outcome'));
    const calls = repository.update.mock.calls.length;
    await expect(service.claim(schedule, 'occurrence2')).rejects.toThrow(
      'unknown write',
    );
    expect(repository.update.mock.calls.length).toBe(calls + 1);
  });
  it('detects direct operational edits but ignores claim and automation toggle changes', async () => {
    const { service, repository } = setup();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    const captured = await service.capture();
    await repository.update(captured.id, {
      automaticSending: true,
      lastTriggerKey: 'claimed',
    });
    await service.verify(captured);
    await repository.update(captured.id, { intervalSeconds: 300 });
    await expect(service.verify(captured)).rejects.toThrow(
      'configuration changed',
    );
  });
});

describe('scheduler lifecycle', () => {
  function schedulerSetup() {
    const { service, repository } = setup();
    const sequencer = {
      isActive: vi.fn().mockReturnValue(false),
      startAutomatic: vi.fn().mockResolvedValue(undefined),
    };
    const report = vi.fn();
    const scheduler = new SendingScheduler(service, sequencer, report);

    return { scheduler, sequencer, service, repository, report };
  }
  it('starts without browser activity once and skips startup catch-up', async () => {
    const { scheduler, sequencer, service } = schedulerSetup();
    await service.automatic('recScheduleA', true);
    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(sequencer.startAutomatic).toHaveBeenCalledExactlyOnceWith(
      'recScheduleA:2026-09-21:09:00',
      Date.parse('2026-09-21T08:00:00Z'),
    );
    scheduler.stop();
    const restarted = schedulerSetup();
    await restarted.service.automatic('recScheduleA', true);
    vi.setSystemTime(new Date('2026-09-21T08:00:30Z'));
    restarted.scheduler.start();
    await restarted.scheduler.evaluate();
    expect(restarted.sequencer.startAutomatic).not.toHaveBeenCalled();
    restarted.scheduler.stop();
  });
  it.each(['busy', 'disabled', 'failed start'])(
    'skips %s occurrences rather than queuing or retrying',
    async (state) => {
      const { scheduler, sequencer, service } = schedulerSetup();
      await service.automatic('recScheduleA', state !== 'disabled');
      sequencer.isActive.mockReturnValue(state === 'busy');
      if (state === 'failed start')
        sequencer.startAutomatic.mockRejectedValue(new Error('Unavailable'));
      scheduler.start();
      await vi.advanceTimersByTimeAsync(60000);
      sequencer.isActive.mockReturnValue(false);
      await scheduler.evaluate();
      expect(sequencer.startAutomatic).toHaveBeenCalledTimes(
        state === 'failed start' ? 1 : 0,
      );
      scheduler.stop();
    },
  );
  it('does not retry a trigger minute after schedule reads recover', async () => {
    const { scheduler, sequencer, service, repository } = schedulerSetup();
    await service.automatic('recScheduleA', true);
    scheduler.start();
    await scheduler.evaluate();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    repository.list.mockRejectedValueOnce(new Error('read failure'));
    await scheduler.evaluate();
    vi.setSystemTime(new Date('2026-09-21T08:00:30Z'));
    await scheduler.evaluate();
    expect(sequencer.startAutomatic).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('makes schedule failures observable and serializes slow evaluations', async () => {
    const { scheduler, repository, report } = schedulerSetup();
    repository.list.mockRejectedValueOnce(new Error('read failure'));
    scheduler.start();
    await scheduler.evaluate();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('could not be read'),
    );
    let release!: () => void;
    repository.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([selected]);
        }),
    );
    const first = scheduler.evaluate();
    await Promise.resolve();
    const second = scheduler.evaluate();
    const calls = repository.list.mock.calls.length;
    await Promise.resolve();
    expect(repository.list).toHaveBeenCalledTimes(calls);
    release();
    await Promise.all([first, second]);
    expect(repository.list).toHaveBeenCalledTimes(calls + 1);
    scheduler.stop();
  });
});
