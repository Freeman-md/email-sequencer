import type { Interaction } from './interaction';
import type { SenderMailbox } from '../interfaces/mailboxes.interface';
import type { QueueCategory } from '../policies/fair-queue';
import type {
  DraftCandidate,
  HistoryInteraction,
} from '@/modules/outreach/interactions';
import type { ProspectQueueContext } from '@/modules/outreach/prospects';
import type { Schedule } from '@/modules/outreach/schedules';

export type QueueCandidate = {
  draft: DraftCandidate;
  prospect: ProspectQueueContext;
  category: QueueCategory;
  queuedAt: number;
  root?: HistoryInteraction;
};

export type QueueResult =
  | QueueSelection
  | { waitUntil: Date }
  | { blocked: string }
  | { rejected: { interactionId: string; message: string } }
  | null;

export interface ISendingQueue {
  prepare(
    schedule: Schedule,
    runStartedAt: string,
    shouldStop: () => boolean,
  ): Promise<void>;
  takeIssues(): Array<{ interactionId: string; message: string }>;
  next(): Promise<QueueResult>;
  assertSubmissionAllowed(interaction: Interaction): Promise<void>;
}

export type QueueSelection = QueueCandidate & {
  dayKey: string;
  mailbox: SenderMailbox;
  originalMessageId?: string;
};
