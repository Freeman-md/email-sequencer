import 'server-only';

import { z } from 'zod';

import {
  readPrivateJson,
  writePrivateJson,
} from '../storage/private-json-file';

import { tokenSchema } from './schemas';
import { FileTokenStore } from './token-store';

import type { StoredToken } from './schemas';

export const mailboxCredentialSchema = tokenSchema.extend({
  googleSubject: z.string().min(1),
});
export type MailboxCredential = z.infer<typeof mailboxCredentialSchema>;
const storeSchema = z.object({
  version: z.literal(2),
  legacyMigration: z.enum(['pending', 'migrated', 'reconnect-required']),
  mailboxes: z.record(
    z.string().regex(/^rec[a-zA-Z0-9]+$/),
    mailboxCredentialSchema,
  ),
});
type CredentialState = z.infer<typeof storeSchema>;

export interface IMailboxTokenStore {
  read(mailboxId: string): Promise<MailboxCredential | null>;
  write(mailboxId: string, credential: MailboxCredential): Promise<void>;
  remove(mailboxId: string): Promise<void>;
  migrationState(): Promise<CredentialState['legacyMigration']>;
  legacy(): Promise<StoredToken | null>;
  finishMigration(result: 'migrated' | 'reconnect-required'): Promise<void>;
}

export class MailboxTokenStore implements IMailboxTokenStore {
  private mutations: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly legacyPath: string,
  ) {}

  private async load(): Promise<CredentialState> {
    const data = await readPrivateJson(this.path);

    if (data === null) {
      return { version: 2, legacyMigration: 'pending', mailboxes: {} };
    }
    const parsed = storeSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(
        'Private mailbox credentials have an unsupported or invalid format. Preserve the file and repair storage before reconnecting.',
      );
    }

    return parsed.data;
  }

  async read(mailboxId: string) {
    await this.mutations;

    return (await this.load()).mailboxes[mailboxId] ?? null;
  }

  write(mailboxId: string, credential: MailboxCredential) {
    return this.mutate((state) => {
      state.mailboxes[mailboxId] = mailboxCredentialSchema.parse(credential);
    });
  }

  remove(mailboxId: string) {
    return this.mutate((state) => {
      delete state.mailboxes[mailboxId];
    });
  }

  async migrationState() {
    await this.mutations;

    return (await this.load()).legacyMigration;
  }

  async legacy() {
    return new FileTokenStore(this.legacyPath).read();
  }

  finishMigration(result: 'migrated' | 'reconnect-required') {
    return this.mutate((state) => {
      state.legacyMigration = result;
    });
  }

  private mutate(update: (state: CredentialState) => void): Promise<void> {
    const operation = this.mutations.then(async () => {
      const state = await this.load();
      update(state);
      await writePrivateJson(this.path, storeSchema.parse(state));
    });
    this.mutations = operation.catch(() => undefined);

    return operation;
  }
}
