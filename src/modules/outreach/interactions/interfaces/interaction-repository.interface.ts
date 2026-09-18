import type {
  DraftCandidate,
  HistoryInteraction,
  FollowUpDraft,
  SentConfirmation,
  SendingInteraction,
} from '../types';

export interface IDraftQueueRepository {
  findNextDraft(
    startedAt: string,
    excluded: ReadonlySet<string>,
  ): Promise<DraftCandidate | null>;
  confirmSent(id: string, confirmation: SentConfirmation): Promise<void>;
  checkConnection(): Promise<void>;
  findById(id: string): Promise<SendingInteraction>;
}

export interface IFollowUpDraftRepository {
  pageFollowUpCandidateProspects(
    offset?: string,
  ): Promise<{ ids: string[]; offset?: string }>;
  findHistoryByIds(ids: string[]): Promise<HistoryInteraction[]>;
  createFollowUpDraft(draft: FollowUpDraft): Promise<void>;
}

export interface IInteractionRepository
  extends IDraftQueueRepository, IFollowUpDraftRepository {}
