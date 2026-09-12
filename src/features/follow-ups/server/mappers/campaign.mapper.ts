import { z } from 'zod';

import { textField } from '@/infrastructure/airtable/record-fields';

import type { Campaign } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export const CAMPAIGN_FIELDS = [
  'Campaign Name',
  'ICP',
  'Buyer Roles',
  'Geography',
  'Company Criteria',
  'Exclusion Criteria',
  'Core Problem',
  'Triggers',
  'Offer',
  'Desired Next Step',
  'Notes',
];
export function mapCampaign(record: AirtableRecord): Campaign {
  const guidance: Campaign['guidance'] = {};
  for (const name of CAMPAIGN_FIELDS.slice(1)) {
    guidance[name] = ['Buyer Roles', 'Geography'].includes(name)
      ? z.array(z.string()).parse(record.fields[name] ?? [])
      : textField(record, name);
  }

  return { id: record.id, name: textField(record, 'Campaign Name'), guidance };
}
