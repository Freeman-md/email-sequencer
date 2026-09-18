import 'server-only';

import { recordSchema, recordsSchema } from '@/infrastructure/airtable/schemas';

import { PROSPECT_TABLE, PROSPECT_FIELDS as field } from './fields';
import { mapProspectContact, mapProspectContext } from './prospect.mapper';

import type { IProspectRepository } from '../interfaces/prospect-repository.interface';
import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export class ProspectRepository implements IProspectRepository {
  constructor(private readonly client: IAirtableClient) {}

  async findContactById(id: string) {
    return mapProspectContact(await this.read(id));
  }

  async findContextById(id: string) {
    return mapProspectContext(await this.read(id));
  }

  private async read(id: string) {
    const record = recordSchema.parse(
      await this.client.request(`${PROSPECT_TABLE}/${encodeURIComponent(id)}`),
    );

    if (record.id !== id) {
      throw new Error('Airtable returned a different Prospect than requested.');
    }

    return record;
  }

  async checkConnection() {
    const query = new URLSearchParams({
      maxRecords: '1',
      filterByFormula: 'FALSE()',
    });
    [field.name, field.email, field.company, field.doNotContact].forEach(
      (name) => query.append('fields[]', name),
    );

    recordsSchema.parse(
      await this.client.request(`${PROSPECT_TABLE}?${query}`),
    );
  }
}
