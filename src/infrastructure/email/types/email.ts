export type Email = {
  beforeSubmit?: () => Promise<void>;
  mailboxId?: string;
  email: string;
  subject: string;
  message: string;
  gmailThreadId?: string;
  gmailOriginalMessageId?: string;
  isFollowUp?: boolean;
};
