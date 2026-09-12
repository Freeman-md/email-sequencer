import type { ConnectionState } from '../../types';

export interface IConnectionsService {
  getState(): Promise<ConnectionState>;
  requireReady(): Promise<void>;
  connectGmail(
    state: string,
    cookie: string | undefined,
    code: string,
  ): Promise<void>;
}
