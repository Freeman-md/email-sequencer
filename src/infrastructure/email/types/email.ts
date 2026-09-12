export type Email = {
  email: string;
  subject: string;
  message: string;
  gmailThreadId?: string;
  isFollowUp?: boolean;
};
