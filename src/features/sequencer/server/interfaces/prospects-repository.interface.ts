import type { Prospect } from '../types';

export interface IProspectsRepository {
  findById(id: string): Promise<Prospect>;
  checkConnection(): Promise<void>;
}
