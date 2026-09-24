import type { InteractionSummary } from '../../types';
import type { QueueCategory } from '../policies/fair-queue';

export type Interaction = InteractionSummary & {
  beforeSubmit?: () => Promise<void>;
  message: string;
  gmailThreadId?: string;
  gmailOriginalMessageId?: string;
  isFollowUp?: boolean;
  queueCategory?: QueueCategory;
  queueDayKey?: string;
};
