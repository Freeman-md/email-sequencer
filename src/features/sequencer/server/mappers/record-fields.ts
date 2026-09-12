import type { AirtableRecord } from '@/infrastructure/airtable/schemas';

export function textField(record: AirtableRecord, key: string): string {
  const value = record.fields[key];

  // Airtable omits empty fields, but a populated field must have the expected type.
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new Error(
      `Airtable record ${record.id} has an invalid ${key} field. Expected text.`,
    );
  }

  return value;
}
