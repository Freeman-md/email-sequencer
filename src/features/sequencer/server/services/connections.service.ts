import 'server-only';

import type { Connection } from '../../types';
import type { ConnectionState } from '../../types';
import type { IConnectionsService } from '../interfaces/connections-service.interface';
import type { GmailConnection } from '../interfaces/gmail-connection.interface';
import type { SequencerRuntime } from '../runtime/sequencer-runtime';
import type { IDraftQueueRepository } from '@/modules/outreach/interactions';
import type { IProspectContactRepository } from '@/modules/outreach/prospects';

export class ConnectionsService implements IConnectionsService {
  private cache?: { expires: number; value: Promise<ConnectionState> };

  constructor(
    private readonly interactions: IDraftQueueRepository,
    private readonly prospects: IProspectContactRepository,
    private readonly gmail: GmailConnection,
    private readonly runtime: SequencerRuntime,
    private readonly now: () => number = Date.now,
  ) {}

  getState(): Promise<ConnectionState> {
    if (!this.cache || this.cache.expires < this.now()) {
      return this.refresh();
    }

    return this.cache.value;
  }

  async requireReady() {
    const connections = await this.refresh();

    if (!connections.airtable.connected)
      throw new Error(connections.airtable.detail);
    if (!connections.gmail.connected) throw new Error(connections.gmail.detail);
  }

  async connectGmail(state: string, cookie: string | undefined, code: string) {
    this.runtime.beginConnectionChange();

    try {
      await this.gmail.completeAuthorization(state, cookie, code);
      this.cache = undefined;
    } finally {
      this.runtime.endConnectionChange();
    }
  }

  private refresh(): Promise<ConnectionState> {
    const value = this.check();
    this.cache = { expires: this.now() + 60_000, value };

    return value;
  }

  private async check(): Promise<ConnectionState> {
    const [airtable, gmail] = await Promise.all([
      this.inspect(async () => {
        await this.interactions.checkConnection();
        await this.prospects.checkConnection();

        return { connected: true, detail: 'Connected' };
      }),
      this.inspect(() => this.gmail.checkConnection()),
    ]);

    return { airtable, gmail };
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
