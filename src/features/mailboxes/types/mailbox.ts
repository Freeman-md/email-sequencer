export type MailboxState = {
  id: string;
  email: string;
  connected: boolean;
  hasCredentials: boolean | null;
  detail: string;
};
export type MailboxesState = {
  mailboxes: MailboxState[];
  migrationNotice?: string;
};
