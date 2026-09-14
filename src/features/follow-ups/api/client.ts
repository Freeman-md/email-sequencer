import type { PreparationState } from '../types/preparation';
import type { IFollowUpsClient } from './interfaces/client.interface';

export class FollowUpsClient implements IFollowUpsClient {
  constructor(
    private readonly request: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  getState(signal: AbortSignal) {
    return this.read('state', 'GET', signal);
  }

  prepare(signal: AbortSignal, limit?: number) {
    return this.read('prepare', 'POST', signal, { limit });
  }

  stop(signal: AbortSignal) {
    return this.read('stop', 'POST', signal);
  }

  private async read(
    action: string,
    method: string,
    signal: AbortSignal,
    body?: object,
  ): Promise<PreparationState> {
    const response = await this.request(`/api/follow-ups/${action}`, {
      method,
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result?.error === 'string'
          ? result.error
          : 'Cannot reach follow-up preparation.',
      );

    return result;
  }
}
export const followUpsClient = new FollowUpsClient();
