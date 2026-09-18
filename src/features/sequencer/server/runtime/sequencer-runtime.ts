import 'server-only';

import { initialRunState, MAX_INTERVAL_SECONDS } from '../../constants/run';

import type { InteractionSummary, RunError, RunState } from '../../types';

export class ConnectionChangeBlockedError extends Error {}

export class SequencerRuntime {
  private state = initialRunState();
  private active = false;
  private stopping = false;
  private connectionChanging = false;
  private excluded = new Set<string>();
  private wake?: () => void;

  constructor(private readonly now: () => Date = () => new Date()) {}

  snapshot(): RunState {
    return structuredClone(this.state);
  }

  isActive() {
    return this.active;
  }

  isStopping() {
    return this.stopping;
  }

  configureInterval(intervalSeconds: number) {
    this.state.intervalSeconds = intervalSeconds;
  }

  excludedIds(): ReadonlySet<string> {
    return new Set(this.excluded);
  }

  exclude(id: string) {
    this.excluded.add(id);
  }

  begin(intervalSeconds: number): string {
    if (this.connectionChanging) {
      throw new Error(
        'Gmail connection is being updated. Wait for it to finish.',
      );
    }
    if (this.active) throw new Error('A run is already active.');
    if (
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < 1 ||
      intervalSeconds > MAX_INTERVAL_SECONDS
    ) {
      throw new Error(
        `Interval Seconds must be a whole number from 1 to ${MAX_INTERVAL_SECONDS}.`,
      );
    }

    // Acquire synchronously before I/O so competing HTTP requests cannot both start.
    const runStartedAt = this.now().toISOString();
    this.active = true;
    this.stopping = false;
    this.excluded.clear();
    this.state = {
      ...initialRunState(),
      lastSent: this.state.lastSent,
      intervalSeconds,
      runStartedAt,
      status: 'running',
      phase: 'fetching',
    };

    return runStartedAt;
  }

  stop(): RunState {
    if (this.active) {
      this.stopping = true;
      this.state.phase = 'stopping';
      this.wake?.();
    }

    return this.snapshot();
  }

  beginConnectionChange() {
    if (this.active || this.connectionChanging) {
      throw new ConnectionChangeBlockedError(
        'Stop the run before changing sending connections or the selected schedule.',
      );
    }

    this.connectionChanging = true;
  }

  endConnectionChange() {
    this.connectionChanging = false;
  }

  fetching() {
    this.state.phase = 'fetching';
    this.state.current = null;
  }

  sending(interaction: InteractionSummary) {
    this.state.current = interaction;
    this.state.phase = 'sending';
  }

  rejected(error: RunError) {
    this.state.failureCount++;
    this.addError(error);
  }

  sent(interaction: InteractionSummary, sentAt: string) {
    this.state.sentCount++;
    this.state.lastSent = { ...interaction, sentAt };
    this.state.phase = this.stopping ? 'stopping' : 'saving';
  }

  halt(error: RunError) {
    this.addError(error);
    this.state.status = 'error';
  }

  completed() {
    this.state.status = 'completed';
  }

  async wait(closesAt?: Date) {
    if (this.stopping) return;

    this.state.phase = 'waiting';
    const duration = Math.max(
      0,
      Math.min(
        this.state.intervalSeconds * 1000,
        closesAt ? closesAt.getTime() - this.now().getTime() : Infinity,
      ),
    );
    this.state.nextSendAt = new Date(
      this.now().getTime() + duration,
    ).toISOString();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wake = undefined;
        resolve();
      }, duration);

      this.wake = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
    });

    this.state.nextSendAt = null;
  }

  finish() {
    if (this.stopping && this.state.status !== 'error')
      this.state.status = 'idle';

    this.state.phase = this.state.status === 'completed' ? 'idle' : 'stopped';
    this.state.nextSendAt = null;
    this.state.finishedAt = this.now().toISOString();
    this.active = false;
    this.wake = undefined;
  }

  private addError(error: RunError) {
    this.state.errors = [...this.state.errors.slice(-19), error];
  }
}
