export type SenderMailbox = {
  id: string;
  email: string;
  connected: boolean;
  hasCredentials: boolean | null;
  detail: string;
};
export interface ISenderMailboxes {
  getState(): Promise<{ mailboxes: SenderMailbox[]; migrationNotice?: string }>;
}
