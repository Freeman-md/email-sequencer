import type { DashboardState, RunState } from '../types';
import type { ISequencerClient } from './interfaces/client.interface';

export class SequencerClient implements ISequencerClient {
  constructor(
    private readonly request: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  getState(signal: AbortSignal) {
    return this.read<DashboardState>(
      'state',
      {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
      },
      'Unable to read run state.',
    );
  }

  start(intervalSeconds: number, signal: AbortSignal) {
    return this.mutate('start', { intervalSeconds }, signal);
  }

  stop(signal: AbortSignal) {
    return this.mutate('stop', {}, signal);
  }

  private mutate(action: 'start' | 'stop', body: object, signal: AbortSignal) {
    return this.read<RunState>(
      action,
      {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      'Unable to update the run.',
    );
  }

  private async read<T>(
    action: string,
    init: RequestInit,
    fallback: string,
  ): Promise<T> {
    const response = await this.request(`/api/sequencer/${action}`, init);
    let result: unknown;

    try {
      result = await response.json();
    } catch {
      throw new Error(fallback);
    }

    if (!response.ok) {
      const message =
        result &&
        typeof result === 'object' &&
        'error' in result &&
        typeof result.error === 'string'
          ? result.error
          : fallback;
      throw new Error(message);
    }

    return result as T;
  }
}

export const sequencerClient = new SequencerClient();
