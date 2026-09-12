import type { Campaign } from '../types';

export interface ICampaignsRepository {
  findById(id: string): Promise<Campaign>;
}
