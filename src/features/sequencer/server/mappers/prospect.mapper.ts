import { AIRTABLE } from '../../constants/airtable';

import { textField } from './record-fields';

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
