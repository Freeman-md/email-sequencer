import type { InteractionSummary } from '../../types';

export type Interaction = InteractionSummary & { message: string };

export type InteractionRecord = {
  id: string;
  status: string;
  direction: string;
  channel: string;
  subject: string;
  message: string;
  prospectIds: string[];
  createdAt: string;
};
