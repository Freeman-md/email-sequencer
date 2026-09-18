import 'server-only';

import type { Connection } from '../../types';
import type { ConnectionState } from '../../types';
import type { IConnectionsService } from '../interfaces/connections-service.interface';
import type { ISenderMailboxes } from '../interfaces/mailboxes.interface';
import type { IDraftQueueRepository } from '@/modules/outreach/interactions';
import type { IProspectContactRepository } from '@/modules/outreach/prospects';

export class ConnectionsService implements IConnectionsService {
  private cache?: { expires: number; value: Promise<ConnectionState> };

  constructor(
    private readonly interactions: IDraftQueueRepository,
    private readonly prospects: IProspectContactRepository,
    private readonly mailboxes: ISenderMailboxes,
    private readonly now: () => number = Date.now,
  ) {}

  getState(): Promise<ConnectionState> {
    if (!this.cache || this.cache.expires < this.now()) {
      return this.refresh();
    }

    return this.cache.value;
  }

  invalidate() {
    this.cache = undefined;
  }

  async requireReady() {
    const connections = await this.refresh();

    if (!connections.airtable.connected)
      throw new Error(connections.airtable.detail);
    if (!connections.gmail.connected) throw new Error(connections.gmail.detail);
  }

  private refresh(): Promise<ConnectionState> {
    const value = this.check();
    this.cache = { expires: this.now() + 60_000, value };

    return value;
  }

  private async check(): Promise<ConnectionState> {
    const [airtable, state] = await Promise.all([
      this.inspect(async () => {
        await this.interactions.checkConnection();
        await this.prospects.checkConnection();

        return { connected: true, detail: 'Connected' };
      }),
      this.mailboxes.getState(),
    ]);
    const available = state.mailboxes.filter((mailbox) => mailbox.connected);
    const gmail = {
      connected: available.length > 0,
      detail: available.length
        ? `${available.length} available mailbox${available.length === 1 ? '' : 'es'}`
        : 'No mailbox available. Add or reconnect Gmail in Mailboxes.',
    };

    return { airtable, gmail, ...state };
  }

  private async inspect(check: () => Promise<Connection>): Promise<Connection> {
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
}
