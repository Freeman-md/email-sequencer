import { AIRTABLE } from '@/infrastructure/airtable/constants';
import { textField, linksField } from '@/infrastructure/airtable/record-fields';

import type { HistoryInteraction, FollowUpDraft } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapInteraction(record: AirtableRecord): HistoryInteraction {
  const field = AIRTABLE.interaction;

  return {
    id: record.id,
    direction: textField(record, field.direction),
    channel: textField(record, field.channel),
    type: textField(record, field.type),
    status: textField(record, field.status),
    subject: textField(record, field.subject),
    message: textField(record, field.message),
    prospectIds: linksField(record, field.prospect),
    createdAt: textField(record, field.createdAt),
    sentAt: textField(record, field.sentAt),
    receivedAt: textField(record, 'Received At'),
    gmailMessageId: textField(record, field.gmailMessageId),
    gmailThreadId: textField(record, field.gmailThreadId),
  };
}
export function draftFields(draft: FollowUpDraft) {
  const field = AIRTABLE.interaction;

  return {
    [field.direction]: 'Outbound',
    [field.channel]: 'Email',
    [field.type]: 'Follow-up',
    [field.status]: 'Draft',
    [field.subject]: draft.subject,
    [field.message]: draft.message,
    [field.prospect]: [draft.prospectId],
    [field.gmailThreadId]: draft.gmailThreadId,
  };
}
