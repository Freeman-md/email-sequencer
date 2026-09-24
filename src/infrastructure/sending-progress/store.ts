import 'server-only';

import { z } from 'zod';

import {
  readPrivateJson,
  writePrivateJson,
} from '../storage/private-json-file';

const categories = ['initial', 'followUp1', 'followUp2', 'followUp3'] as const;
const integerCounts = (value: z.ZodNumber) =>
  z.object({
    initial: value,
    followUp1: value,
    followUp2: value,
    followUp3: value,
  });
const countsSchema = integerCounts(z.number().int().nonnegative());
const currentSchema = integerCounts(z.number().int());
const daySchema = z.object({
  key: z.string().min(1),
  allocation: countsSchema,
  confirmed: countsSchema,
  current: currentSchema,
});
const stateSchema = z.object({
  version: z.literal(1),
  day: daySchema.nullable(),
  mailboxLastConfirmedAt: z.record(z.string(), z.iso.datetime()),
  accountedAttemptIds: z.array(z.string().min(1)),
});

export type ProgressCategory = (typeof categories)[number];
export type ProgressCounts = z.infer<typeof countsSchema>;
export type SendingProgressState = z.infer<typeof stateSchema>;

export interface ISendingProgressStore {
  read(): Promise<SendingProgressState>;
  prepareDay(
    key: string,
    allocation: ProgressCounts,
  ): Promise<SendingProgressState>;
  advance(category: ProgressCategory, current: ProgressCounts): Promise<void>;
  recordConfirmed(input: {
    attemptId: string;
    dayKey: string;
    category: ProgressCategory;
    mailboxId: string;
    sentAt: string;
  }): Promise<void>;
}

const emptyState = (): SendingProgressState => ({
  version: 1,
  day: null,
  mailboxLastConfirmedAt: {},
  accountedAttemptIds: [],
});

export class FileSendingProgressStore implements ISendingProgressStore {
  private mutations: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async read() {
    await this.mutations;

    return this.load();
  }

  prepareDay(key: string, allocation: ProgressCounts) {
    return this.mutate((state) => {
      if (state.day?.key === key) {
        state.day.allocation = countsSchema.parse(
          Object.fromEntries(
            categories.map((category) => [
              category,
              state.day!.confirmed[category] + allocation[category],
            ]),
          ),
        );
        const remainingWeight = categories.reduce(
          (sum, category) => sum + allocation[category],
          0,
        );
        for (const category of categories) {
          state.day.current[category] =
            remainingWeight === 0
              ? 0
              : Math.max(
                  -remainingWeight,
                  Math.min(remainingWeight, state.day.current[category]),
                );
        }
      } else {
        state.day = {
          key,
          allocation,
          confirmed: { initial: 0, followUp1: 0, followUp2: 0, followUp3: 0 },
          current: { initial: 0, followUp1: 0, followUp2: 0, followUp3: 0 },
        };
      }

      return state;
    });
  }

  advance(category: ProgressCategory, current: ProgressCounts) {
    return this.mutate((state) => {
      if (!state.day) {
        throw new Error('Daily queue allocation changed before reservation.');
      }
      state.day.current = currentSchema.parse(current);
    }).then(() => undefined);
  }

  recordConfirmed(input: {
    attemptId: string;
    dayKey: string;
    category: ProgressCategory;
    mailboxId: string;
    sentAt: string;
  }) {
    return this.mutate((state) => {
      if (state.accountedAttemptIds.includes(input.attemptId)) {
        return;
      }
      if (!state.day || state.day.key !== input.dayKey) {
        throw new Error(
          'Confirmed send belongs to a different queue day. Reconcile progress manually.',
        );
      }

      state.day.confirmed[input.category]++;
      state.mailboxLastConfirmedAt[input.mailboxId] = input.sentAt;
      state.accountedAttemptIds.push(input.attemptId);
    }).then(() => undefined);
  }

  private async load() {
    const value = await readPrivateJson(this.path);

    return value === null ? emptyState() : stateSchema.parse(value);
  }

  private mutate<T>(update: (state: SendingProgressState) => T): Promise<T> {
    const operation = this.mutations.then(async () => {
      const state = await this.load();
      const result = update(state);
      await writePrivateJson(this.path, stateSchema.parse(state));

      return result;
    });
    this.mutations = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  }
}
