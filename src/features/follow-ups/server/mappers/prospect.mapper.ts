import { z } from 'zod';

import { textField, linksField } from '@/infrastructure/airtable/record-fields';

import type { Prospect } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapProspect(record: AirtableRecord): Prospect {
  return {
    id: record.id,
    name: textField(record, 'Full Name'),
    email: textField(record, 'Email').trim(),
    role: textField(record, 'Role'),
    company: textField(record, 'Company'),
    campaignIds: linksField(record, 'Campaign'),
    interactionIds: linksField(record, 'Interactions'),
    doNotContact: z.boolean().parse(record.fields['Do Not Contact'] ?? false),
    signal: textField(record, 'Signal'),
    sources: textField(record, 'Sources'),
    qualificationNotes: textField(record, 'Qualification Notes'),
  };
}
