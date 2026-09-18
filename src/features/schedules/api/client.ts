import type { SchedulesState } from '../types/state';
import type {
  ISchedulesClient,
  ScheduleCommand,
} from './interfaces/client.interface';
import type { ScheduleConfiguration } from '@/modules/outreach/schedules';

export class SchedulesClient implements ISchedulesClient {
  constructor(
    private readonly request: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  getState(signal: AbortSignal) {
    return this.read('GET', undefined, signal);
  }

  create(configuration: ScheduleConfiguration, signal: AbortSignal) {
    return this.read('POST', configuration, signal);
  }

  change(command: ScheduleCommand, signal: AbortSignal) {
    return this.read('PATCH', command, signal);
  }

  delete(id: string, signal: AbortSignal) {
    return this.read('DELETE', { id, confirmed: true }, signal);
  }

  private async read(
    method: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<SchedulesState> {
    const response = await this.request('/api/schedules', {
      method,
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : 'Schedule change was not confirmed. Refresh and check Airtable.',
      );
    }

    return result;
  }
}
export const schedulesClient = new SchedulesClient();
