export type Connection = { connected: boolean; detail: string };

export type MailboxConnection = Connection & {
  id: string;
  email: string;
  hasCredentials: boolean | null;
};
export type ConnectionState = {
  airtable: Connection;
  gmail: Connection;
  mailboxes: MailboxConnection[];
  migrationNotice?: string;
};
