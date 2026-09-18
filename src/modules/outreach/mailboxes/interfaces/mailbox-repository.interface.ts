import type { Mailbox } from '../types';

export interface IMailboxRepository {
  list(): Promise<Mailbox[]>;
  create(identity: Omit<Mailbox, 'id'>): Promise<Mailbox>;
  updateEmail(
    id: string,
    email: string,
    googleSubject: string,
  ): Promise<Mailbox>;
}
