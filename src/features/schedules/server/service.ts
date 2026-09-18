import 'server-only';
import {
  nextTrigger,
  NEW_SCHEDULE_DEFAULTS,
  sameOperationalSchedule,
  selectedSchedule,
  validateSchedule,
  windowOpen,
} from '@/modules/outreach/schedules';

import type {
  IScheduleRepository,
  ISendingSchedule,
  Schedule,
  ScheduleStatus,
} from '@/modules/outreach/schedules';

interface ScheduleRunLock {
  isActive(): boolean;
  beginConnectionChange(): void;
  endConnectionChange(): void;
}

export class SchedulesService implements ISendingSchedule {
  private mutations: Promise<void> = Promise.resolve();
  private selectionError: string | null = null;
  private schedulerError: string | null =
    'Automatic scheduler is not running in this process. Use the production server to initialize scheduling; manual starts still obey the selected window.';
  private onChange: () => void = () => undefined;

  constructor(
    private readonly repository: IScheduleRepository,
    private readonly run: ScheduleRunLock,
    private readonly now: () => Date = () => new Date(),
  ) {}

  setChangeListener(listener: () => void) {
    this.onChange = listener;
  }

  setSchedulerError(message: string | null) {
    this.schedulerError = message;
  }

  async list() {
    try {
      return await this.repository.list();
    } catch {
      throw new Error(
        'Schedules could not be read. Check Airtable access and schema; sending is blocked.',
      );
    }
  }

  async capture() {
    if (this.selectionError) {
      throw new Error(this.selectionError);
    }

    return selectedSchedule(await this.list());
  }

  async verify(schedule: Schedule) {
    const current = await this.capture();
    if (!sameOperationalSchedule(schedule, current)) {
      throw new Error(
        'Selected schedule or sending configuration changed. Draft unchanged; start a fresh run.',
      );
    }
    if (!windowOpen(current, this.now())) {
      throw new Error(
        'Selected sending window is closed. Draft unchanged; start within the selected window.',
      );
    }
  }

  async status(): Promise<ScheduleStatus> {
    try {
      const selected = await this.capture();

      return {
        selected,
        windowOpen: windowOpen(selected, this.now()),
        nextTriggerAt: this.schedulerError
          ? null
          : (nextTrigger(selected, this.now())?.toISOString() ?? null),
        error: null,
        schedulerError: this.schedulerError,
      };
    } catch (error) {
      return {
        selected: null,
        windowOpen: false,
        nextTriggerAt: null,
        error:
          error instanceof Error
            ? error.message
            : 'Schedule unavailable. Sending blocked.',
        schedulerError: this.schedulerError,
      };
    }
  }

  create(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Provide schedule configuration.');
    }
    const configuration = validateSchedule({
      ...NEW_SCHEDULE_DEFAULTS,
      ...value,
    });

    return this.mutate(() => this.repository.create(configuration));
  }

  edit(id: string, value: unknown) {
    const configuration = validateSchedule(value);

    return this.mutate(async () => {
      const schedule = await this.requireRecord(id);
      await this.withSelectedLock(schedule.selected, () =>
        this.repository.update(id, configuration),
      );
    });
  }

  delete(id: string, confirmed: boolean) {
    if (!confirmed) {
      throw new Error('Confirm deletion of this schedule.');
    }

    return this.mutate(async () => {
      const schedule = await this.requireRecord(id);
      await this.withSelectedLock(schedule.selected, () =>
        this.repository.delete(id),
      );
    });
  }

  select(id: string) {
    return this.mutate(async () => {
      this.run.beginConnectionChange();

      try {
        const records = await this.list();
        const target = records.find((schedule) => schedule.id === id);
        if (!target) {
          throw new Error('Schedule not found. Refresh before selecting.');
        }
        const { name, days, opensAt, closesAt, timezone, intervalSeconds } =
          target;
        validateSchedule({
          name,
          days,
          opensAt,
          closesAt,
          timezone,
          intervalSeconds,
        });
        for (const schedule of records) {
          if (schedule.selected && schedule.id !== id) {
            await this.repository.update(schedule.id, { selected: false });
          }
        }
        await this.repository.update(id, { selected: true });
        if (selectedSchedule(await this.list()).id !== id) {
          throw new Error('Selected identity differs.');
        }
        this.selectionError = null;
      } catch {
        this.selectionError =
          'Schedule selection was not confirmed. Sending blocked. Repair Selected in Airtable and explicitly select again.';
        throw new Error(this.selectionError);
      } finally {
        this.run.endConnectionChange();
      }
    });
  }

  automatic(id: string, enabled: boolean) {
    return this.mutate(async () => {
      const schedule = await this.requireRecord(id);
      // Turning automatic starts off never interrupts an in-flight run.
      await this.withSelectedLock(schedule.selected && enabled, () =>
        this.repository.update(id, { automaticSending: enabled }),
      );
    });
  }

  async claim(schedule: Schedule, key: string) {
    const current = await this.capture();
    if (
      !sameOperationalSchedule(current, schedule) ||
      !current.automaticSending ||
      current.lastTriggerKey === key
    ) {
      throw new Error(
        'Automatic occurrence is disabled, changed or already claimed.',
      );
    }
    await this.repository.update(schedule.id, { lastTriggerKey: key });
    const confirmed = await this.capture();
    if (
      !sameOperationalSchedule(confirmed, schedule) ||
      !confirmed.automaticSending ||
      confirmed.lastTriggerKey !== key
    ) {
      throw new Error(
        'Automatic trigger claim was not confirmed. Occurrence skipped; do not replay.',
      );
    }
  }

  private async requireRecord(id: string) {
    const schedule = (await this.list()).find((record) => record.id === id);
    if (!schedule) {
      throw new Error('Schedule not found. Refresh before changing it.');
    }

    return schedule;
  }

  private async withSelectedLock<T>(
    required: boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (required) {
      this.run.beginConnectionChange();
    }

    try {
      return await operation();
    } finally {
      if (required) {
        this.run.endConnectionChange();
      }
    }
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation);
    this.mutations = result.then(
      () => undefined,
      () => undefined,
    );
    void result.then(
      () => this.onChange(),
      () => this.onChange(),
    );

    return result;
  }
}
