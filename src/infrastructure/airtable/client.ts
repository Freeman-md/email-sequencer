import 'server-only';

import type { Config } from '../config/schemas';
import type { IAirtableClient } from './interfaces/client.interface';

export class AirtableClient implements IAirtableClient {
  constructor(
    private readonly config: Pick<
      Config,
      'AIRTABLE_API_TOKEN' | 'AIRTABLE_BASE_ID'
    >,
    private readonly fetchRequest: typeof fetch = fetch,
  ) {}

  async request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;

    try {
      response = await this.fetchRequest(
        `https://api.airtable.com/v0/${this.config.AIRTABLE_BASE_ID}/${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${this.config.AIRTABLE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      throw new Error(
        'Airtable could not be reached. Check connectivity before starting another run.',
      );
    }
    if (!response.ok)
      throw new Error(
        `Airtable request failed (HTTP ${response.status}). Check base access, token scopes and field configuration.`,
      );

    try {
      return await response.json();
    } catch {
      throw new Error('Airtable returned an unreadable response.');
    }
  }
}
