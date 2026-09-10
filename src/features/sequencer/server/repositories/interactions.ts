import 'server-only';
import {
  airtableRequest,
  recordsSchema,
  recordSchema,
} from '@/infrastructure/airtable/client';
import type { AirtableRecord } from '@/infrastructure/airtable/client';
import { AIRTABLE } from '../../constants/airtable';
import type { Interaction } from '../../types';

const field = AIRTABLE.interaction;
const text = (record: AirtableRecord, key: string) =>
  typeof record.fields[key] === 'string' ? (record.fields[key] as string) : '';
const literal = (value: string) =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

export function eligibleQuery(
  runStartedAt: string,
  excludedIds: ReadonlySet<string>,
) {
  const cutoff = new Date(runStartedAt).toISOString();
  const conditions = [
    `{${field.status}}='Draft'`,
    `{${field.direction}}='Outbound'`,
    `{${field.channel}}='Email'`,
    `LEN(TRIM({${field.subject}}&''))>0`,
    `LEN(TRIM({${field.message}}&''))>0`,
    `{${field.prospect}}!=BLANK()`,
    `{${field.createdAt}}!=BLANK()`,
    `{${field.createdAt}}<=DATETIME_PARSE(${literal(cutoff)})`,
    ...Array.from(excludedIds, (id) => `RECORD_ID()!=${literal(id)}`),
  ];
  return {
    filterByFormula: `AND(${conditions.join(',')})`,
    maxRecords: 1,
    pageSize: 1,
    sort: [{ field: field.createdAt, direction: 'asc' }],
    fields: Object.values(field),
  };
}

export function createInteractionRepository(request = airtableRequest) {
  return {
    async next(
      runStartedAt: string,
      excludedIds: ReadonlySet<string>,
    ): Promise<Interaction | null> {
      const excluded = new Set(excludedIds);
      // Airtable cannot join a linked Email in a formula without adding a lookup field.
      // Resolve candidates individually and omit those without a recipient for this run.
      while (true) {
        const data = recordsSchema.parse(
          await request(`${AIRTABLE.interactions}/listRecords`, {
            method: 'POST',
            body: JSON.stringify(eligibleQuery(runStartedAt, excluded)),
          }),
        );
        const record = data.records[0];
        if (!record) return null;
        if (excluded.has(record.id))
          throw new Error(
            'Airtable returned an excluded Interaction. Run stopped.',
          );
        const links = record.fields[field.prospect];
        if (
          !Array.isArray(links) ||
          links.length !== 1 ||
          typeof links[0] !== 'string'
        ) {
          throw new Error(
            `Interaction ${record.id} must link to exactly one Prospect. Correct the relationship before sending.`,
          );
        }
        const prospect = recordSchema.parse(
          await request(
            `${AIRTABLE.prospects}/${encodeURIComponent(links[0])}`,
          ),
        );
        const email = text(prospect, AIRTABLE.prospect.email).trim();
        const createdAt = text(record, field.createdAt);
        if (
          !email ||
          !text(record, field.subject).trim() ||
          !text(record, field.message).trim()
        ) {
          excluded.add(record.id);
          continue;
        }
        if (
          !Number.isFinite(Date.parse(createdAt)) ||
          Date.parse(createdAt) > Date.parse(runStartedAt) ||
          text(record, field.status) !== 'Draft' ||
          text(record, field.direction) !== 'Outbound' ||
          text(record, field.channel) !== 'Email'
        ) {
          throw new Error(
            `Airtable returned an ineligible Interaction (${record.id}). Run stopped without sending.`,
          );
        }
        return {
          id: record.id,
          prospect: text(prospect, AIRTABLE.prospect.name) || email,
          company: text(prospect, AIRTABLE.prospect.company),
          email,
          subject: text(record, field.subject),
          message: text(record, field.message),
          createdAt,
        };
      }
    },
    async complete(id: string, sentAt: string) {
      const result = recordSchema.parse(
        await request(`${AIRTABLE.interactions}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fields: { [field.status]: 'Completed', [field.sentAt]: sentAt },
          }),
        }),
      );
      if (
        result.id !== id ||
        result.fields[field.status] !== 'Completed' ||
        Date.parse(text(result, field.sentAt)) !== Date.parse(sentAt)
      ) {
        throw new Error(
          'Airtable did not confirm the Completed status and Sent At update.',
        );
      }
    },
    async checkConnection() {
      const query = new URLSearchParams({
        maxRecords: '1',
        filterByFormula: 'FALSE()',
      });
      for (const [table, fields] of [
        [AIRTABLE.interactions, Object.values(field)],
        [AIRTABLE.prospects, Object.values(AIRTABLE.prospect)],
      ] as const) {
        const params = new URLSearchParams(query);
        fields.forEach((name) => params.append('fields[]', name));
        recordsSchema.parse(await request(`${table}?${params}`));
      }
    },
  };
}
