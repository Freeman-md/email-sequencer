import type {
  DraftCandidate,
  HistoryInteraction,
  FollowUpDraft,
  SentConfirmation,
} from '../types';

export interface IDraftQueueRepository {
  findNextDraft(
    startedAt: string,
    excluded: ReadonlySet<string>,
  ): Promise<DraftCandidate | null>;
  confirmSent(id: string, confirmation: SentConfirmation): Promise<void>;
  checkConnection(): Promise<void>;
}

export interface IFollowUpDraftRepository {
  findHistoryByIds(ids: string[]): Promise<HistoryInteraction[]>;
  createFollowUpDraft(draft: FollowUpDraft): Promise<void>;
}

export interface IInteractionRepository
  extends IDraftQueueRepository, IFollowUpDraftRepository {}
