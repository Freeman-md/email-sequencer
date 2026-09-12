import type { Prospect } from '../types';

export interface IProspectsRepository {
  page(offset?: string): Promise<{ ids: string[]; offset?: string }>;
  findById(id: string): Promise<Prospect>;
}
