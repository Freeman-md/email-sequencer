import type { InteractionSummary } from '../../types';

export type Interaction = InteractionSummary & {
  beforeSubmit?: () => Promise<void>;
  message: string;
  gmailThreadId?: string;
  gmailOriginalMessageId?: string;
  isFollowUp?: boolean;
};
