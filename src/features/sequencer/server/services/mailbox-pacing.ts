import 'server-only';

import { allocateMailbox, resolveFollowUpMailbox } from '../policies/sender';

import type { SenderMailbox } from '../interfaces/mailboxes.interface';
import type { QueueCandidate } from '../types/queue';
import type { ISendAttemptStore } from '@/infrastructure/send-attempts/store';
import type { ISendingProgressStore } from '@/infrastructure/sending-progress/store';

const MAILBOX_COOLDOWN_MS = 720_000;

export type SenderAvailability =
  | { mailbox: SenderMailbox; originalMessageId?: string }
  | { waitUntil: number }
  | { unavailable: true };

export class MailboxPacing {
  constructor(
    private readonly attempts: ISendAttemptStore,
    private readonly progress: ISendingProgressStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolve(
    candidate: QueueCandidate,
    mailboxes: SenderMailbox[],
    lastConfirmed: Record<string, string>,
  ): Promise<SenderAvailability> {
    const mailbox = candidate.root
      ? this.followUpMailbox(candidate, mailboxes)
      : await this.initialMailbox(mailboxes, lastConfirmed);
    if (!mailbox) {
      return { unavailable: true };
    }
    if ('waitUntil' in mailbox) {
      return mailbox;
    }

    const sentAt = lastConfirmed[mailbox.id];
    if (sentAt && this.cooldownEnds(sentAt) > this.now().getTime()) {
      return { waitUntil: this.cooldownEnds(sentAt) };
    }

    return {
      mailbox,
      ...(candidate.root
        ? { originalMessageId: candidate.root.gmailMessageId }
        : {}),
    };
  }

  async assertReady(mailboxId: string) {
    const state = await this.progress.read();
    const sentAt = state.mailboxLastConfirmedAt[mailboxId];
    if (sentAt && this.cooldownEnds(sentAt) > this.now().getTime()) {
      throw new Error(
        'Sender mailbox is still cooling down. Draft unchanged; no email submitted.',
      );
    }
  }

  async assertSelectedMailbox(
    candidate: QueueCandidate,
    mailboxId: string,
    mailboxes: SenderMailbox[],
  ) {
    const selected = candidate.root
      ? this.followUpMailbox(candidate, mailboxes)
      : mailboxes.find(
          (mailbox) => mailbox.id === mailboxId && mailbox.connected,
        );
    if (!selected || 'waitUntil' in selected || selected.id !== mailboxId) {
      throw new Error(
        'Selected sender is no longer permitted. Draft unchanged; no email submitted.',
      );
    }
    await this.assertReady(mailboxId);
  }

  async globalReadyAt(intervalSeconds: number) {
    const state = await this.progress.read();
    const latest = Object.values(state.mailboxLastConfirmedAt).reduce(
      (maximum, sentAt) => Math.max(maximum, Date.parse(sentAt)),
      0,
    );

    return latest ? latest + intervalSeconds * 1000 : 0;
  }

  async assertGlobalReady(intervalSeconds: number) {
    if ((await this.globalReadyAt(intervalSeconds)) > this.now().getTime()) {
      throw new Error(
        'Global sending interval has not elapsed. Draft unchanged; no email submitted.',
      );
    }
  }

  private followUpMailbox(
    candidate: QueueCandidate,
    mailboxes: SenderMailbox[],
  ) {
    try {
      return resolveFollowUpMailbox(
        candidate.draft,
        candidate.root!,
        mailboxes,
      );
    } catch {
      return null;
    }
  }

  private async initialMailbox(
    mailboxes: SenderMailbox[],
    lastConfirmed: Record<string, string>,
  ): Promise<SenderMailbox | { waitUntil: number } | null> {
    const ready = mailboxes.filter((mailbox) => {
      const sentAt = lastConfirmed[mailbox.id];

      return (
        mailbox.connected &&
        (!sentAt || this.cooldownEnds(sentAt) <= this.now().getTime())
      );
    });
    if (ready.length) {
      const cursor = (await this.attempts.read()).lastAllocatedMailboxId;

      return allocateMailbox(ready, cursor);
    }

    const cooldowns = mailboxes
      .filter((mailbox) => mailbox.connected && lastConfirmed[mailbox.id])
      .map((mailbox) => this.cooldownEnds(lastConfirmed[mailbox.id]!));

    return cooldowns.length ? { waitUntil: Math.min(...cooldowns) } : null;
  }

  private cooldownEnds(sentAt: string) {
    return Date.parse(sentAt) + MAILBOX_COOLDOWN_MS;
  }
}
