import type { MailboxesState } from '../../types/mailbox';

export interface IMailboxesClient {
  getState(signal: AbortSignal): Promise<MailboxesState>;
  disconnect(mailboxId: string, signal: AbortSignal): Promise<MailboxesState>;
}
