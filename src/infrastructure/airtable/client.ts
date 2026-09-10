import 'server-only';
import { z } from 'zod';
import { getConfig } from '@/infrastructure/config/env';

export const recordSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
export const recordsSchema = z.object({ records: z.array(recordSchema) });
export type AirtableRecord = z.infer<typeof recordSchema>;

export async function airtableRequest(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const config = getConfig();
  let response: Response;
  try {
    response = await fetch(
      `https://api.airtable.com/v0/${config.AIRTABLE_BASE_ID}/${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${config.AIRTABLE_API_TOKEN}`,
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
