import 'server-only';
import { gmailConnection } from '@/infrastructure/gmail/oauth';
import { createInteractionRepository } from '../repositories/interactions';
import type { Connection } from '../../types';

async function inspect(check: () => Promise<Connection>): Promise<Connection> {
  try {
    return await check();
  } catch (error) {
    return {
      connected: false,
      detail:
        error instanceof Error ? error.message : 'Connection unavailable.',
    };
  }
}

export async function checkConnections() {
  const [airtable, gmail] = await Promise.all([
    inspect(async () => {
      await createInteractionRepository().checkConnection();
      return { connected: true, detail: 'Connected' };
    }),
    inspect(gmailConnection),
  ]);
  return { airtable, gmail };
}
