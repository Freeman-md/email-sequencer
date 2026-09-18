export type SendingInteraction = {
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
  sentAt: string;
  mailboxIds: string[];
  initialInteractionIds: string[];
};

export type DraftCandidate = SendingInteraction;

export type HistoryInteraction = SendingInteraction & {
  receivedAt: string;
};
export type FollowUpDraft = {
  prospectId: string;
  subject: string;
  message: string;
  gmailThreadId: string;
  initialInteractionId: string;
};

export type SentConfirmation = {
  mailboxId: string;
  sentAt: string;
  gmailMessageId: string;
  gmailThreadId: string;
};
