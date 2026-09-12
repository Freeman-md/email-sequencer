import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { textField } from '@/infrastructure/airtable/record-fields';

import type { Prospect } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapProspect(record: AirtableRecord): Prospect {
  return {
    id: record.id,
    name: textField(record, AIRTABLE.prospect.name),
    company: textField(record, AIRTABLE.prospect.company),
    email: textField(record, AIRTABLE.prospect.email).trim(),
  };
}
