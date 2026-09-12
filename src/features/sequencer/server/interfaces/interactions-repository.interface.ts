import type { InteractionRecord } from '../types';
import type { SendResult } from '@/infrastructure/email/types/send-result';

export interface IInteractionsRepository {
  next(
    startedAt: string,
    excluded: ReadonlySet<string>,
  ): Promise<InteractionRecord | null>;
  complete(
    id: string,
    confirmation: Extract<SendResult, { kind: 'confirmed' }>,
  ): Promise<void>;
  checkConnection(): Promise<void>;
}
