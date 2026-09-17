import type { Campaign } from '../types';

export interface ICampaignRepository {
  findById(id: string): Promise<Campaign>;
}
