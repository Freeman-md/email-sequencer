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
  type: NumberedFollowUpType;
};

export const INITIAL_MESSAGE_TYPE = 'Initial Message' as const;
export const NUMBERED_FOLLOW_UP_TYPES = [
  'Follow-up 1',
  'Follow-up 2',
  'Follow-up 3',
] as const;
export type NumberedFollowUpType = (typeof NUMBERED_FOLLOW_UP_TYPES)[number];

export function numberedFollowUpType(step: number): NumberedFollowUpType {
  const type = NUMBERED_FOLLOW_UP_TYPES[step - 1];
  if (!type) {
    throw new Error(`Unsupported follow-up step ${step}.`);
  }

  return type;
}

export function numberedFollowUpStep(type: string): 1 | 2 | 3 | null {
  const index = NUMBERED_FOLLOW_UP_TYPES.findIndex(
    (candidate) => candidate === type,
  );

  return index < 0 ? null : ((index + 1) as 1 | 2 | 3);
}

export function isFollowUpType(type: string): boolean {
  return numberedFollowUpStep(type) !== null;
}

export type SentConfirmation = {
  mailboxId: string;
  sentAt: string;
  gmailMessageId: string;
  gmailThreadId: string;
};
