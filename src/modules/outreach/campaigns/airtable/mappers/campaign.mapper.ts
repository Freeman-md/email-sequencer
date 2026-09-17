import { z } from 'zod';

import { textField } from '@/infrastructure/airtable/record-fields';

import { CAMPAIGN_FIELDS as field } from '../fields';

import type { Campaign } from '../../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapCampaign(record: AirtableRecord): Campaign {
  return {
    id: record.id,
    name: textField(record, field.name),
    guidance: {
      icp: textField(record, field.icp),
      buyerRoles: z
        .array(z.string())
        .parse(record.fields[field.buyerRoles] ?? []),
      geography: z
        .array(z.string())
        .parse(record.fields[field.geography] ?? []),
      companyCriteria: textField(record, field.companyCriteria),
      exclusionCriteria: textField(record, field.exclusionCriteria),
      coreProblem: textField(record, field.coreProblem),
      triggers: textField(record, field.triggers),
      offer: textField(record, field.offer),
      desiredNextStep: textField(record, field.desiredNextStep),
      notes: textField(record, field.notes),
    },
  };
}
