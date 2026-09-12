import { z } from 'zod';

import type { FollowUpStep } from '../../constants/steps';
import type { Prospect, HistoryInteraction, DueFollowUp } from '../types';

export function assessFollowUp(
  prospect: Prospect,
  history: HistoryInteraction[],
  steps: readonly FollowUpStep[],
  now: number,
): { due: DueFollowUp; reason?: never } | { reason: string; due?: never } {
  if (prospect.doNotContact) return { reason: 'Do Not Contact' };
  if (!z.email().safeParse(prospect.email).success)
    return { reason: 'Missing or invalid Prospect Email' };
  if (prospect.campaignIds.length !== 1)
    return { reason: 'Missing or ambiguous Campaign' };
  if (
    history.some(
      (item) =>
        item.prospectIds.length !== 1 || item.prospectIds[0] !== prospect.id,
    )
  )
    return { reason: 'Ambiguous Interaction relationship' };
  const outbound = history.filter(
    (item) =>
      item.channel === 'Email' &&
      item.direction === 'Outbound' &&
      item.status === 'Completed' &&
      ['Initial Message', 'Follow-up'].includes(item.type),
  );
  if (outbound.some((item) => !Number.isFinite(Date.parse(item.sentAt))))
    return { reason: 'Missing or invalid outbound Sent At' };
  outbound.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  const initialMessages = outbound.filter(
    (item) => item.type === 'Initial Message',
  );
  const original = initialMessages[0];
  if (!original) return { reason: 'No completed Initial Message' };
  if (initialMessages.length !== 1 || outbound[0]?.id !== original.id)
    return { reason: 'Ambiguous initial conversation' };
  const sequence = outbound;
  const latest = sequence.at(-1)!;
  if (
    sequence.some(
      (item, index) =>
        index > 0 &&
        Date.parse(item.sentAt) === Date.parse(sequence[index - 1]!.sentAt),
    )
  )
    return { reason: 'Ambiguous outbound order' };
  if (!original.gmailThreadId.trim() || !latest.gmailThreadId.trim())
    return { reason: 'Missing Gmail Thread ID' };
  if (!original.gmailMessageId.trim() || !latest.gmailMessageId.trim())
    return { reason: 'Missing Gmail Message ID' };
  if (sequence.some((item) => item.gmailThreadId !== original.gmailThreadId))
    return { reason: 'Conflicting Gmail threads' };
  if (!original.subject.trim() || !original.message.trim())
    return { reason: 'Missing original email context' };
  const inbound = history.filter(
    (item) => item.direction === 'Inbound' && item.status === 'Completed',
  );
  if (inbound.some((item) => !Number.isFinite(Date.parse(item.receivedAt))))
    return { reason: 'Inbound Interaction missing reliable Received At' };
  // A reply ends this sequence, even if another outbound was subsequently logged.
  if (
    inbound.some(
      (item) => Date.parse(item.receivedAt) >= Date.parse(original.sentAt),
    )
  )
    return { reason: 'Reply already received' };
  if (
    history.some(
      (item) =>
        item.direction === 'Outbound' &&
        item.channel === 'Email' &&
        item.type === 'Follow-up' &&
        item.status === 'Draft',
    )
  )
    return { reason: 'Existing Draft Follow-up' };
  const number =
    sequence.filter((item) => item.type === 'Follow-up').length + 1;
  const step = steps.find((step) => step.number === number);
  if (!step) return { reason: 'Sequence complete' };
  if (Date.parse(latest.sentAt) + step.waitDays * 86400000 > now)
    return { reason: 'Not due yet' };

  return { due: { step, original, latest } };
}
