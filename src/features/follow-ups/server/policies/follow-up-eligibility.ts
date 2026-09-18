import { z } from 'zod';

import type { FollowUpStep } from '../../constants/steps';
import type { DueFollowUp } from '../types/follow-up';
import type { HistoryInteraction } from '@/modules/outreach/interactions';
import type { ProspectContext } from '@/modules/outreach/prospects';

export function assessFollowUp(
  prospect: ProspectContext,
  history: HistoryInteraction[],
  steps: readonly FollowUpStep[],
  now: number,
): { due: DueFollowUp; reason?: never } | { reason: string; due?: never } {
  const prospectReason = prospectEligibilityReason(prospect);
  if (prospectReason) {
    return { reason: prospectReason };
  }

  if (
    history.some(
      (item) =>
        item.prospectIds.length !== 1 || item.prospectIds[0] !== prospect.id,
    )
  ) {
    return { reason: 'Ambiguous Interaction relationship' };
  }

  const outbound = completedOutboundInteractions(history);
  if (!hasReliableOutboundSentAt(outbound)) {
    return { reason: 'Missing or invalid outbound Sent At' };
  }

  outbound.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  const initialMessages = outbound.filter(
    (item) => item.type === 'Initial Message',
  );
  const original = initialMessages[0];
  if (!original) {
    return { reason: 'No completed Initial Message' };
  }
  if (initialMessages.length !== 1 || outbound[0]?.id !== original.id) {
    return { reason: 'Ambiguous initial conversation' };
  }

  const sequence = outbound;
  if (
    original.mailboxIds.length !== 1 ||
    original.initialInteractionIds.length !== 0
  ) {
    return {
      reason:
        'Missing or ambiguous original mailbox ownership; reconcile historical records',
    };
  }
  if (
    sequence.some(
      (item) =>
        item.mailboxIds.length !== 1 ||
        item.mailboxIds[0] !== original.mailboxIds[0] ||
        (item.type === 'Follow-up' &&
          (item.initialInteractionIds.length !== 1 ||
            item.initialInteractionIds[0] !== original.id)),
    )
  ) {
    return {
      reason: 'Conflicting sender ownership or initial conversation links',
    };
  }
  const latest = sequence.at(-1)!;
  if (hasAmbiguousOutboundOrder(sequence)) {
    return { reason: 'Ambiguous outbound order' };
  }
  if (!original.gmailThreadId.trim() || !latest.gmailThreadId.trim()) {
    return { reason: 'Missing Gmail Thread ID' };
  }
  if (!original.gmailMessageId.trim() || !latest.gmailMessageId.trim()) {
    return { reason: 'Missing Gmail Message ID' };
  }
  if (sequence.some((item) => item.gmailThreadId !== original.gmailThreadId)) {
    return { reason: 'Conflicting Gmail threads' };
  }
  if (!original.subject.trim() || !original.message.trim()) {
    return { reason: 'Missing original email context' };
  }

  const inbound = completedInboundInteractions(history);
  if (!hasReliableInboundReceivedAt(inbound)) {
    return { reason: 'Inbound Interaction missing reliable Received At' };
  }
  // A reply ends this sequence, even if another outbound was subsequently logged.
  if (hasReplySinceOriginal(inbound, original)) {
    return { reason: 'Reply already received' };
  }
  if (hasFollowUpDraft(history)) {
    return { reason: 'Existing Draft Follow-up' };
  }

  const number =
    sequence.filter((item) => item.type === 'Follow-up').length + 1;
  const step = steps.find((step) => step.number === number);
  if (!step) {
    return { reason: 'Sequence complete' };
  }
  if (Date.parse(latest.sentAt) + step.waitDays * 86400000 > now) {
    return { reason: 'Not due yet' };
  }

  return { due: { step, original, latest } };
}

function prospectEligibilityReason(prospect: ProspectContext) {
  if (prospect.doNotContact) {
    return 'Do Not Contact';
  }
  if (!z.email().safeParse(prospect.email).success) {
    return 'Missing or invalid Prospect Email';
  }
  if (prospect.campaignIds.length !== 1) {
    return 'Missing or ambiguous Campaign';
  }
}

function completedOutboundInteractions(history: HistoryInteraction[]) {
  return history.filter(
    (item) =>
      item.channel === 'Email' &&
      item.direction === 'Outbound' &&
      item.status === 'Completed' &&
      ['Initial Message', 'Follow-up'].includes(item.type),
  );
}

function hasReliableOutboundSentAt(outbound: HistoryInteraction[]) {
  return outbound.every((item) => Number.isFinite(Date.parse(item.sentAt)));
}

function hasAmbiguousOutboundOrder(sequence: HistoryInteraction[]) {
  return sequence.some(
    (item, index) =>
      index > 0 &&
      Date.parse(item.sentAt) === Date.parse(sequence[index - 1]!.sentAt),
  );
}

function completedInboundInteractions(history: HistoryInteraction[]) {
  return history.filter(
    (item) => item.direction === 'Inbound' && item.status === 'Completed',
  );
}

function hasReliableInboundReceivedAt(inbound: HistoryInteraction[]) {
  return inbound.every((item) => Number.isFinite(Date.parse(item.receivedAt)));
}

function hasReplySinceOriginal(
  inbound: HistoryInteraction[],
  original: HistoryInteraction,
) {
  return inbound.some(
    (item) => Date.parse(item.receivedAt) >= Date.parse(original.sentAt),
  );
}

function hasFollowUpDraft(history: HistoryInteraction[]) {
  return history.some(
    (item) =>
      item.direction === 'Outbound' &&
      item.channel === 'Email' &&
      item.type === 'Follow-up' &&
      item.status === 'Draft',
  );
}
