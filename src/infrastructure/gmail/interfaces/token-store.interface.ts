import type { StoredToken } from '../schemas';

export interface TokenStore {
  read(): Promise<StoredToken | null>;
  write(token: StoredToken): Promise<void>;
}
