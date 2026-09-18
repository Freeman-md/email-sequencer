import type { StoredToken } from '../schemas';

export interface TokenReader {
  read(): Promise<StoredToken | null>;
}

export interface TokenStore extends TokenReader {
  write(token: StoredToken): Promise<void>;
}
