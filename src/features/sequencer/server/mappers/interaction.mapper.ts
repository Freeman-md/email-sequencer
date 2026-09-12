import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { textField } from '@/infrastructure/airtable/record-fields';

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
    type: textField(record, field.type),
    gmailThreadId: textField(record, field.gmailThreadId),
    gmailMessageId: textField(record, field.gmailMessageId),
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
    gmailMessageId: textField(record, AIRTABLE.interaction.gmailMessageId),
    gmailThreadId: textField(record, AIRTABLE.interaction.gmailThreadId),
  };
}
