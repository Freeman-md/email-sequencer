export type DraftCandidate = {
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

export type HistoryInteraction = DraftCandidate & {
  sentAt: string;
  receivedAt: string;
};
export type FollowUpDraft = {
  prospectId: string;
  subject: string;
  message: string;
  gmailThreadId: string;
};

export type SentConfirmation = {
  sentAt: string;
  gmailMessageId: string;
  gmailThreadId: string;
};
