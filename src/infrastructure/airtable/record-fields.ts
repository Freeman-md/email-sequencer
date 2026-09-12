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

export function linksField(record: AirtableRecord, key: string): string[] {
  const value = record.fields[key] ?? [];
  if (
    !Array.isArray(value) ||
    !value.every((id) => typeof id === 'string' && /^rec[a-zA-Z0-9]+$/.test(id))
  )
    throw new Error(`Airtable record ${record.id} has invalid ${key} links.`);

  return value;
}
