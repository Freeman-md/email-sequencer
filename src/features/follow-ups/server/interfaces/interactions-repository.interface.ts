import type { HistoryInteraction, FollowUpDraft } from '../types';

export interface IInteractionsRepository {
  history(ids: string[]): Promise<HistoryInteraction[]>;
  createDraft(draft: FollowUpDraft): Promise<void>;
}
