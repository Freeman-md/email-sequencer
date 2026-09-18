import { textField } from '@/infrastructure/airtable/record-fields';

import { MAILBOX_FIELDS as field } from './fields';

import type { Mailbox } from '../types';
import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function mapMailbox(record: AirtableRecord): Mailbox {
  if (!/^rec[a-zA-Z0-9]+$/.test(record.id)) {
    throw new Error('Airtable returned an invalid mailbox record ID.');
  }

  return {
    id: record.id,
    email: textField(record, field.email),
    googleSubject: textField(record, field.googleSubject),
  };
}
