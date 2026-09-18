export type Email = {
  mailboxId?: string;
  email: string;
  subject: string;
  message: string;
  gmailThreadId?: string;
  gmailOriginalMessageId?: string;
  isFollowUp?: boolean;
};
