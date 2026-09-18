import type { ConnectionState } from '../../types';

export interface IConnectionsService {
  getState(): Promise<ConnectionState>;
  requireReady(): Promise<void>;
}
