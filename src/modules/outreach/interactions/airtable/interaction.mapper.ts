import { textField, linksField } from '@/infrastructure/airtable/record-fields';

import { INTERACTION_FIELDS as field, RECEIVED_AT_FIELD } from './fields';

import type {
  DraftCandidate,
  HistoryInteraction,
  FollowUpDraft,
} from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapDraftCandidate(record: AirtableRecord): DraftCandidate {
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
    prospectIds: linksField(record, field.prospect),
    createdAt: textField(record, field.createdAt),
    sentAt: textField(record, field.sentAt),
    mailboxIds: linksField(record, field.mailbox),
    initialInteractionIds: linksField(record, field.initialInteraction),
  };
}

export function mapInteractionCompletion(record: AirtableRecord) {
  return {
    id: record.id,
    status: textField(record, field.status),
    mailboxIds: linksField(record, field.mailbox),
    sentAt: textField(record, field.sentAt),
    gmailMessageId: textField(record, field.gmailMessageId),
    gmailThreadId: textField(record, field.gmailThreadId),
  };
}

export function mapInteractionHistory(
  record: AirtableRecord,
): HistoryInteraction {
  return {
    ...mapDraftCandidate(record),
    receivedAt: textField(record, RECEIVED_AT_FIELD),
  };
}

export function draftFields(draft: FollowUpDraft) {
  return {
    [field.direction]: 'Outbound',
    [field.channel]: 'Email',
    [field.type]: 'Follow-up',
    [field.status]: 'Draft',
    [field.subject]: draft.subject,
    [field.message]: draft.message,
    [field.prospect]: [draft.prospectId],
    [field.gmailThreadId]: draft.gmailThreadId,
    [field.initialInteraction]: [draft.initialInteractionId],
    [field.mailbox]: [],
  };
}
