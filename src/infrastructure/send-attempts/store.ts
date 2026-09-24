import 'server-only';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  readPrivateJson,
  writePrivateJson,
} from '../storage/private-json-file';

const confirmationSchema = z.object({
  sentAt: z.iso.datetime(),
  gmailMessageId: z.string().min(1),
  gmailThreadId: z.string().min(1),
});
const attemptSchema = z.object({
  id: z.string().min(1),
  interactionId: z.string().min(1),
  mailboxId: z.string().min(1),
  mailboxEmail: z.email(),
  reservedAt: z.iso.datetime(),
  confirmation: confirmationSchema.optional(),
  queueDayKey: z.string().min(1).optional(),
  queueCategory: z
    .enum(['initial', 'followUp1', 'followUp2', 'followUp3'])
    .optional(),
});
const stateSchema = z.object({
  version: z.literal(1),
  lastAllocatedMailboxId: z.string().nullable(),
  pending: attemptSchema.nullable(),
});

export type SendAttempt = z.infer<typeof attemptSchema>;
export type AttemptState = z.infer<typeof stateSchema>;
export interface ISendAttemptStore {
  read(): Promise<AttemptState>;
  reserve(
    input: Pick<
      SendAttempt,
      | 'interactionId'
      | 'mailboxId'
      | 'mailboxEmail'
      | 'queueDayKey'
      | 'queueCategory'
    >,
    advanceCursor: boolean,
  ): Promise<SendAttempt>;
  confirm(
    id: string,
    confirmation: z.infer<typeof confirmationSchema>,
  ): Promise<void>;
  resolve(id: string): Promise<void>;
}

export class FileSendAttemptStore implements ISendAttemptStore {
  private mutations: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  private async load(): Promise<AttemptState> {
    const data = await readPrivateJson(this.path);

    return data === null
      ? { version: 1, lastAllocatedMailboxId: null, pending: null }
      : stateSchema.parse(data);
  }

  async read() {
    await this.mutations;

    return this.load();
  }

  async reserve(
    input: Pick<
      SendAttempt,
      | 'interactionId'
      | 'mailboxId'
      | 'mailboxEmail'
      | 'queueDayKey'
      | 'queueCategory'
    >,
    advanceCursor: boolean,
  ) {
    const attempt = attemptSchema.parse({
      ...input,
      id: randomUUID(),
      reservedAt: new Date().toISOString(),
    });
    await this.mutate((state) => {
      if (state.pending) {
        throw new Error(reconciliationGuidance(state.pending));
      }
      state.pending = attempt;
      if (advanceCursor) {
        state.lastAllocatedMailboxId = input.mailboxId;
      }
    });

    return attempt;
  }

  confirm(id: string, confirmation: z.infer<typeof confirmationSchema>) {
    return this.mutate((state) => {
      if (state.pending?.id !== id) {
        throw new Error(
          'Send-attempt identity changed. Stop and reconcile; do not resend.',
        );
      }
      state.pending.confirmation = confirmationSchema.parse(confirmation);
    });
  }

  resolve(id: string) {
    return this.mutate((state) => {
      if (state.pending?.id !== id) {
        throw new Error(
          'Send-attempt identity changed. Stop and reconcile; do not resend.',
        );
      }
      state.pending = null;
    });
  }

  private mutate(update: (state: AttemptState) => void) {
    const operation = this.mutations.then(async () => {
      const state = await this.load();
      update(state);
      await writePrivateJson(this.path, stateSchema.parse(state));
    });
    this.mutations = operation.catch(() => undefined);

    return operation;
  }
}

export function reconciliationGuidance(attempt: SendAttempt): string {
  const ids = attempt.confirmation
    ? ` Gmail confirmed Sent At ${attempt.confirmation.sentAt}, Message ID ${attempt.confirmation.gmailMessageId}, Thread ID ${attempt.confirmation.gmailThreadId}. Confirm all completion fields in Airtable, including Sent From Mailbox ${attempt.mailboxId}.`
    : ' Gmail outcome is unknown. Inspect Sent mail in that mailbox and reconcile the Interaction; never assume it was not sent.';

  return `Unresolved send attempt ${attempt.id} for Interaction ${attempt.interactionId}, mailbox ${attempt.mailboxEmail} (${attempt.mailboxId}).${ids} Sending is blocked until this particular attempt is explicitly reconciled. Do not resend.`;
}
