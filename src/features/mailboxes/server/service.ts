import 'server-only';

import type { MailboxState, MailboxesState } from '../types/mailbox';
import type { GmailAuthorization } from '@/infrastructure/gmail/authorization';
import type { IGmailClient } from '@/infrastructure/gmail/interfaces/client.interface';
import type { MailboxGmailService } from '@/infrastructure/gmail/mailbox-service';
import type {
  IMailboxTokenStore,
  MailboxCredential,
} from '@/infrastructure/gmail/mailbox-token-store';
import type { IMailboxRepository, Mailbox } from '@/modules/outreach/mailboxes';

interface ConnectionLock {
  isActive(): boolean;
  beginConnectionChange(): void;
  endConnectionChange(): void;
}

export class MailboxReconnectMismatchError extends Error {}

export class MailboxesService {
  private migration?: Promise<void>;
  private connectionRevision = 0;
  private checks?: { revision: number; result: Promise<MailboxesState> };

  constructor(
    private readonly repository: IMailboxRepository,
    private readonly credentials: IMailboxTokenStore,
    private readonly authorization: GmailAuthorization,
    private readonly gmail: MailboxGmailService,
    private readonly client: IGmailClient,
    private readonly lock: ConnectionLock,
  ) {}

  async getState(): Promise<MailboxesState> {
    if (!this.checks) {
      const current = {
        revision: this.connectionRevision,
        result: this.checkState(),
      };
      this.checks = current;
      void current.result
        .finally(() => {
          if (this.checks === current) {
            this.checks = undefined;
          }
        })
        .catch(() => undefined);
    }
    const current = this.checks;
    const result = await current.result;

    return current.revision === this.connectionRevision
      ? result
      : this.getState();
  }

  private async checkState(): Promise<MailboxesState> {
    await this.migrateLegacyConnection();
    const records = await this.repository.list();
    const states: MailboxState[] = new Array(records.length);
    let next = 0;

    const checkNext = async () => {
      while (next < records.length) {
        const index = next++;
        const mailbox = records[index]!;
        const duplicates = records.filter(
          (record) => record.googleSubject === mailbox.googleSubject,
        );

        try {
          if (!mailbox.googleSubject || duplicates.length !== 1) {
            states[index] = {
              id: mailbox.id,
              email: mailbox.email,
              connected: false,
              hasCredentials:
                (await this.credentials.read(mailbox.id)) !== null,
              detail:
                'Missing or duplicate Google Subject in Airtable. Repair metadata before reconnecting.',
            };
          } else {
            states[index] = {
              id: mailbox.id,
              email: mailbox.email,
              ...(await this.gmail.check(
                mailbox.id,
                mailbox.googleSubject,
                mailbox.email,
              )),
            };
          }
        } catch {
          states[index] = {
            id: mailbox.id,
            email: mailbox.email,
            connected: false,
            hasCredentials: null,
            detail:
              'Private credentials cannot be read. Check file ownership and permissions before reconnecting.',
          };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, records.length) }, checkNext),
    );
    const migrationState = await this.credentials.migrationState();

    return {
      mailboxes: states.sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
      migrationNotice:
        migrationState === 'reconnect-required'
          ? 'The preserved legacy connection could not be assigned a verified Google identity. Add that account again; historical sender ownership is not inferred.'
          : migrationState === 'pending'
            ? 'Stop the run and open Mailboxes to complete legacy connection migration.'
            : undefined,
    };
  }

  async beginAuthorization(mailboxId?: string) {
    this.lock.beginConnectionChange();

    try {
      if (mailboxId) {
        const mailbox = await this.requireMailbox(mailboxId);
        if (!mailbox.googleSubject) {
          throw new Error(
            'Mailbox Google Subject is missing. Repair metadata before reconnecting.',
          );
        }
      }

      return await this.authorization.begin(mailboxId);
    } finally {
      this.lock.endConnectionChange();
    }
  }

  async completeAuthorization(
    state: string,
    cookie: string | undefined,
    code: string,
  ) {
    this.lock.beginConnectionChange();

    try {
      const identity = await this.authorization.complete(state, cookie, code);
      if (identity.mailboxId) {
        const intended = await this.requireMailbox(identity.mailboxId);
        if (intended.googleSubject !== identity.googleSubject) {
          throw new MailboxReconnectMismatchError(
            'Reconnect rejected: Google returned a different account. Select the intended mailbox.',
          );
        }
      }
      await this.saveIdentity(identity, identity.mailboxId);
    } finally {
      this.connectionRevision++;
      this.lock.endConnectionChange();
    }
  }

  async disconnect(mailboxId: string) {
    this.lock.beginConnectionChange();

    try {
      await this.requireMailbox(mailboxId);
      await this.credentials.remove(mailboxId);
    } finally {
      this.connectionRevision++;
      this.lock.endConnectionChange();
    }
  }

  private async requireMailbox(id: string): Promise<Mailbox> {
    const mailbox = (await this.repository.list()).find(
      (record) => record.id === id,
    );
    if (!mailbox) {
      throw new Error(
        'Mailbox identity unavailable in Airtable. Refresh and repair its Google Subject.',
      );
    }

    return mailbox;
  }

  private async saveIdentity(
    identity: { email: string; googleSubject: string; refreshToken?: string },
    intendedId?: string,
  ) {
    const matches = (await this.repository.list()).filter(
      (record) => record.googleSubject === identity.googleSubject,
    );
    if (matches.length > 1) {
      throw new Error(
        'Duplicate Google Subject records. Reconcile mailbox metadata in Airtable; no credentials changed.',
      );
    }
    const existing = matches[0];
    if (intendedId && existing?.id !== intendedId) {
      throw new Error(
        'Reconnect mailbox identity changed. Refresh Airtable before trying again.',
      );
    }
    const previous = existing ? await this.credentials.read(existing.id) : null;
    const refreshToken =
      identity.refreshToken ??
      (previous?.googleSubject === identity.googleSubject
        ? previous.refreshToken
        : undefined);
    if (!refreshToken) {
      throw new Error(
        'Google supplied no offline access. Reconnect and grant offline permission.',
      );
    }
    let mailbox =
      existing ??
      (await this.repository.create({
        email: identity.email,
        googleSubject: identity.googleSubject,
      }));
    if (mailbox.email !== identity.email) {
      mailbox = await this.repository.updateEmail(
        mailbox.id,
        identity.email,
        identity.googleSubject,
      );
    }
    const credential: MailboxCredential = {
      email: identity.email,
      googleSubject: identity.googleSubject,
      refreshToken,
    };
    await this.credentials.write(mailbox.id, credential);
  }

  private async migrateLegacyConnection() {
    if (this.migration) {
      return this.migration;
    }
    if (
      (await this.credentials.migrationState()) !== 'pending' ||
      this.lock.isActive()
    ) {
      return;
    }
    if (this.migration) {
      return this.migration;
    }
    // Share one migration across simultaneous dashboard requests.
    this.migration = this.performMigration();

    try {
      await this.migration;
    } finally {
      this.migration = undefined;
    }
  }

  private async performMigration() {
    this.lock.beginConnectionChange();

    try {
      const legacy = await this.credentials.legacy();
      if (!legacy) {
        await this.credentials.finishMigration('migrated');

        return;
      }
      let identity: { email: string; googleSubject: string };

      try {
        identity = await this.client.verifiedRefreshIdentity(
          legacy.refreshToken,
        );
        if (identity.email.toLowerCase() !== legacy.email.toLowerCase()) {
          throw new Error('Legacy email mismatch');
        }
      } catch {
        await this.credentials.finishMigration('reconnect-required');

        return;
      }
      const matches = (await this.repository.list()).filter(
        (mailbox) => mailbox.googleSubject === identity.googleSubject,
      );
      const current =
        matches.length === 1
          ? await this.credentials.read(matches[0]!.id)
          : null;
      if (!current || current.googleSubject !== identity.googleSubject) {
        await this.saveIdentity({
          ...identity,
          refreshToken: legacy.refreshToken,
        });
      }
      await this.credentials.finishMigration('migrated');
    } finally {
      this.lock.endConnectionChange();
    }
  }
}
