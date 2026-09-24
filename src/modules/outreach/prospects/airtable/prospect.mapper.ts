import { z } from 'zod';

import { textField, linksField } from '@/infrastructure/airtable/record-fields';

import { PROSPECT_FIELDS as field } from './fields';

import type {
  ProspectContact,
  ProspectContext,
  ProspectQueueContext,
} from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapProspectContact(record: AirtableRecord): ProspectContact {
  return {
    id: record.id,
    doNotContact: z.boolean().parse(record.fields[field.doNotContact] ?? false),
    name: textField(record, field.name),
    company: textField(record, field.company),
    email: textField(record, field.email).trim(),
  };
}

export function mapProspectContext(record: AirtableRecord): ProspectContext {
  return {
    ...mapProspectContact(record),
    role: textField(record, field.role),
    campaignIds: linksField(record, field.campaignIds),
    interactionIds: linksField(record, field.interactionIds),
    signal: textField(record, field.signal),
    sources: textField(record, field.sources),
    qualificationNotes: textField(record, field.qualificationNotes),
  };
}

export function mapProspectQueueContext(
  record: AirtableRecord,
): ProspectQueueContext {
  return {
    ...mapProspectContact(record),
    interactionIds: linksField(record, field.interactionIds),
  };
}
