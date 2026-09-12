import { AIRTABLE } from '../../constants/airtable';

import { textField } from './record-fields';

import type { InteractionRecord } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapInteraction(record: AirtableRecord): InteractionRecord {
  const field = AIRTABLE.interaction;
  const links = record.fields[field.prospect] ?? [];

  if (
    !Array.isArray(links) ||
    !links.every((id) => typeof id === 'string' && id.length > 0)
  ) {
    throw new Error(
      `Interaction ${record.id} has an invalid Prospect link field.`,
    );
  }

  return {
    id: record.id,
    status: textField(record, field.status),
    direction: textField(record, field.direction),
    channel: textField(record, field.channel),
    subject: textField(record, field.subject),
    message: textField(record, field.message),
    prospectIds: links,
    createdAt: textField(record, field.createdAt),
  };
}

export function mapInteractionCompletion(record: AirtableRecord) {
  return {
    id: record.id,
    status: textField(record, AIRTABLE.interaction.status),
    sentAt: textField(record, AIRTABLE.interaction.sentAt),
  };
}
