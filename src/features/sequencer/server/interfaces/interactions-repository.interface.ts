import type { InteractionRecord } from '../types';

export interface IInteractionsRepository {
  next(
    startedAt: string,
    excluded: ReadonlySet<string>,
  ): Promise<InteractionRecord | null>;
  complete(id: string, sentAt: string): Promise<void>;
  checkConnection(): Promise<void>;
}
