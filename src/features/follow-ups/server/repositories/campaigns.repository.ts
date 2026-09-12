import 'server-only';
import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { recordSchema } from '@/infrastructure/airtable/schemas';

import { mapCampaign } from '../mappers/campaign.mapper';

import type { ICampaignsRepository } from '../interfaces/campaigns-repository.interface';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class CampaignsRepository implements ICampaignsRepository {
  constructor(private readonly client: IAirtableClient) {}

  async findById(id: string) {
    const record = recordSchema.parse(
      await this.client.request(
        `${AIRTABLE.campaigns}/${encodeURIComponent(id)}`,
      ),
    );
    if (record.id !== id)
      throw new Error('Airtable returned a different Campaign.');

    return mapCampaign(record);
  }
}
