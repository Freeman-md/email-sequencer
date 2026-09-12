import type { Connection } from '../../types';

export interface GmailConnection {
  checkConnection(): Promise<Connection>;
  completeAuthorization(
    state: string,
    cookie: string | undefined,
    code: string,
  ): Promise<void>;
}
