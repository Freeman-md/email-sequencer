import 'server-only';
import { recordSchema } from '@/infrastructure/airtable/schemas';

import { CAMPAIGN_TABLE } from './fields';
import { mapCampaign } from './mappers/campaign.mapper';

import type { ICampaignRepository } from '../interfaces/campaign-repository.interface';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class CampaignRepository implements ICampaignRepository {
  constructor(private readonly client: IAirtableClient) {}

  async findById(id: string) {
    const record = recordSchema.parse(
      await this.client.request(`${CAMPAIGN_TABLE}/${encodeURIComponent(id)}`),
    );
    if (record.id !== id)
      throw new Error('Airtable returned a different Campaign.');

    return mapCampaign(record);
  }
}
