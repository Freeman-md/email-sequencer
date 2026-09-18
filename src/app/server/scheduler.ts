import 'server-only';
import { triggerKey } from '@/modules/outreach/schedules';
import type { ISendingSchedule } from '@/modules/outreach/schedules';

interface AutomaticSequencer {
  isActive(): boolean;
  startAutomatic(key: string, minute: number): Promise<void>;
}

export class SendingScheduler {
  private evaluation: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private startedAt: number | null = null;
  private attemptedKeys = new Map<string, number>();
  private failedMinute: number | null = null;
  private stopped = false;

  constructor(
    private readonly schedules: ISendingSchedule,
    private readonly sequencer: AutomaticSequencer,
    private readonly report: (error: string | null) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start() {
    if (this.startedAt !== null) {
      return;
    }
    this.startedAt = this.now().getTime();
    void this.evaluate();
    this.scheduleNextTick();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  evaluate() {
    const evaluation = this.evaluation.then(() => this.tick());
    this.evaluation = evaluation.catch(() => undefined);
    return evaluation;
  }

  private scheduleNextTick() {
    this.timer = setTimeout(async () => {
      await this.evaluate();
      if (!this.stopped) {
        this.scheduleNextTick();
      }
    }, 30000);
    this.timer.unref?.();
  }

  private async tick() {
    if (this.startedAt === null || this.stopped) {
      return;
    }
    try {
      const schedule = await this.schedules.capture();
      const now = this.now();
      const minute = Math.floor(now.getTime() / 60000) * 60000;
      const key = triggerKey(schedule, now);
      for (const [seenKey, seenAt] of this.attemptedKeys) {
        if (now.getTime() - seenAt > 8 * 86400000) {
          this.attemptedKeys.delete(seenKey);
        }
      }
      this.report(null);
      if (
        !schedule.automaticSending ||
        !key ||
        minute <= this.startedAt ||
        this.failedMinute === minute ||
        this.attemptedKeys.has(key) ||
        schedule.lastTriggerKey === key
      ) {
        return;
      }
      // Mark busy, blocked and failed starts too: they are skipped, never queued.
      this.attemptedKeys.set(key, now.getTime());
      if (this.sequencer.isActive()) {
        return;
      }
      await this.sequencer.startAutomatic(key, minute);
    } catch (error) {
      this.failedMinute = Math.floor(this.now().getTime() / 60000) * 60000;
      this.report(
        error instanceof Error
          ? error.message
          : 'Scheduler unavailable. Automatic starts are blocked.',
      );
    }
  }
}
