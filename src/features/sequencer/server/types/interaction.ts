import type { InteractionSummary } from '../../types';

export type Interaction = InteractionSummary & {
  message: string;
  gmailThreadId?: string;
  isFollowUp?: boolean;
};

export type InteractionRecord = {
  id: string;
  type: string;
  gmailThreadId: string;
  gmailMessageId: string;
  status: string;
  direction: string;
  channel: string;
  subject: string;
  message: string;
  prospectIds: string[];
  createdAt: string;
};
