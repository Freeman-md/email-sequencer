import type { FollowUpStep } from '../../constants/steps';

export type Prospect = {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  campaignIds: string[];
  interactionIds: string[];
  doNotContact: boolean;
  signal: string;
  sources: string;
  qualificationNotes: string;
};
export type HistoryInteraction = {
  id: string;
  direction: string;
  channel: string;
  type: string;
  status: string;
  subject: string;
  message: string;
  createdAt: string;
  sentAt: string;
  receivedAt: string;
  gmailMessageId: string;
  gmailThreadId: string;
  prospectIds: string[];
};
export type Campaign = {
  id: string;
  name: string;
  guidance: Record<string, string | string[]>;
};
export type DueFollowUp = {
  step: FollowUpStep;
  original: HistoryInteraction;
  latest: HistoryInteraction;
};
export type GenerationContext = {
  prospect: Prospect;
  campaign: Campaign;
  history: HistoryInteraction[];
  due: DueFollowUp;
};
export type FollowUpDraft = {
  prospectId: string;
  subject: string;
  message: string;
  gmailThreadId: string;
};
