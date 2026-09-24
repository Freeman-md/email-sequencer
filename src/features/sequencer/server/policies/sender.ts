import {
  INITIAL_MESSAGE_TYPE,
  isFollowUpType,
} from '@/modules/outreach/interactions';

import type { SenderMailbox } from '../interfaces/mailboxes.interface';
import type {
  DraftCandidate,
  SendingInteraction,
} from '@/modules/outreach/interactions';

export function allocateMailbox(
  mailboxes: SenderMailbox[],
  lastAllocatedId: string | null,
): SenderMailbox {
  const available = mailboxes
    .filter((mailbox) => mailbox.connected)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected =
    available.find(
      (mailbox) => lastAllocatedId === null || mailbox.id > lastAllocatedId,
    ) ?? available[0];
  if (!selected) {
    throw new Error(
      'No mailbox is available. Connect or reconnect a Gmail account and check Google availability before starting another run.',
    );
  }

  return selected;
}

export function conversationRootId(draft: DraftCandidate): string | undefined {
  if (draft.mailboxIds.length !== 0 || draft.gmailMessageId || draft.sentAt) {
    throw new Error(
      'Draft already has sender attribution, Sent At or a Gmail Message ID. Reconcile it; do not resend.',
    );
  }
  if (draft.type === INITIAL_MESSAGE_TYPE) {
    if (draft.initialInteractionIds.length || draft.gmailThreadId) {
      throw new Error(
        'Initial Message has an existing conversation link or thread. Draft unchanged; reconcile ownership.',
      );
    }

    return undefined;
  }
  if (!isFollowUpType(draft.type)) {
    throw new Error(
      `Unsupported outbound conversation type: ${draft.type || 'missing Type'}. Use Initial Message or an exact numbered Follow-up Type.`,
    );
  }
  if (
    draft.initialInteractionIds.length !== 1 ||
    draft.initialInteractionIds[0] === draft.id
  ) {
    throw new Error(
      'Follow-up must link directly to exactly one original Initial Interaction. Legacy ownership must be reconciled; no sender was guessed.',
    );
  }

  return draft.initialInteractionIds[0]!;
}

export function resolveFollowUpMailbox(
  draft: DraftCandidate,
  root: SendingInteraction,
  mailboxes: SenderMailbox[],
): SenderMailbox {
  if (
    root.id !== draft.initialInteractionIds[0] ||
    root.type !== INITIAL_MESSAGE_TYPE ||
    root.status !== 'Completed' ||
    root.direction !== 'Outbound' ||
    root.channel !== 'Email' ||
    root.initialInteractionIds.length !== 0
  ) {
    throw new Error(
      'Initial Interaction is not an original completed outbound email. Repair the root link; draft unchanged.',
    );
  }
  if (
    root.prospectIds.length !== 1 ||
    root.prospectIds[0] !== draft.prospectIds[0]
  ) {
    throw new Error(
      'Follow-up and Initial Interaction link to different or ambiguous Prospects. Draft unchanged.',
    );
  }
  if (
    !Number.isFinite(Date.parse(root.sentAt)) ||
    !root.gmailMessageId ||
    !root.gmailThreadId ||
    draft.gmailThreadId !== root.gmailThreadId ||
    draft.subject !== root.subject
  ) {
    throw new Error(
      'Follow-up conversation/thread information conflicts with its original email. Draft unchanged; repair the conversation links.',
    );
  }
  if (root.mailboxIds.length !== 1) {
    throw new Error(
      'Original email has missing or ambiguous Sent From Mailbox. Reconcile historical ownership; never rotate this follow-up.',
    );
  }
  const mailbox = mailboxes.find((item) => item.id === root.mailboxIds[0]);
  if (!mailbox?.connected) {
    throw new Error(
      `Original sender mailbox ${root.mailboxIds[0]} is unavailable. Reconnect that account; follow-up draft unchanged.`,
    );
  }

  return mailbox;
}
