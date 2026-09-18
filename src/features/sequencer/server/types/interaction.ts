import type { InteractionSummary } from '../../types';

export type Interaction = InteractionSummary & {
  message: string;
  gmailThreadId?: string;
  gmailOriginalMessageId?: string;
  isFollowUp?: boolean;
};
