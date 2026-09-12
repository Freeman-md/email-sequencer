import type { Connection } from '../../types';

export interface GmailConnection {
  check(): Promise<Connection>;
  authorize(
    state: string,
    cookie: string | undefined,
    code: string,
  ): Promise<void>;
}
