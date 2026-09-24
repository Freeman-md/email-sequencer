import 'server-only';

import { z } from 'zod';

import {
  INITIAL_MESSAGE_TYPE,
  isFollowUpType,
  numberedFollowUpStep,
} from '@/modules/outreach/interactions';
import {
  scheduleLocalDate,
  windowClosesAt,
} from '@/modules/outreach/schedules';

import {
  allocateCapacity,
  compareQueueAge,
  emptyCategoryCounts,
  nextSmoothCategory,
  QUEUE_CATEGORIES,
  redistributionCategory,
} from '../policies/fair-queue';
import { conversationRootId } from '../policies/sender';

import type { MailboxPacing } from './mailbox-pacing';
import type { ISenderMailboxes } from '../interfaces/mailboxes.interface';
import type { QueueCategory } from '../policies/fair-queue';
import type { Interaction } from '../types/interaction';
import type {
  QueueCandidate,
  QueueResult,
  QueueSelection,
} from '../types/queue';
import type { ISendingProgressStore } from '@/infrastructure/sending-progress/store';
import type {
  DraftCandidate,
  HistoryInteraction,
  IDraftQueueRepository,
} from '@/modules/outreach/interactions';
import type { IProspectQueueRepository } from '@/modules/outreach/prospects';
import type { Schedule } from '@/modules/outreach/schedules';

export class DailyQueue {
  private candidates: QueueCandidate[] = [];
  private dayKey = '';
  private runStartedAt = '';
  private schedule?: Schedule;
  private issues: Array<{ interactionId: string; message: string }> = [];

  constructor(
    private readonly interactions: IDraftQueueRepository,
    private readonly prospects: IProspectQueueRepository,
    private readonly mailboxes: ISenderMailboxes,
    private readonly pacing: MailboxPacing,
    private readonly progress: ISendingProgressStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async prepare(
    schedule: Schedule,
    runStartedAt: string,
    shouldStop: () => boolean = () => false,
  ) {
    this.runStartedAt = runStartedAt;
    this.schedule = schedule;
    const drafts = await this.interactions.listDrafts(runStartedAt);
    this.candidates = [];
    this.issues = [];

    for (const draft of drafts) {
      if (shouldStop()) {
        return;
      }
      const candidate = await this.resolveCandidate(draft, runStartedAt);
      if (shouldStop()) {
        return;
      }
      if (candidate) {
        this.candidates.push(candidate);
      }
    }
    this.sortCandidates();

    this.dayKey = `${schedule.id}:${schedule.timezone}:${scheduleLocalDate(schedule, this.now())}`;
    const demand = emptyCategoryCounts();
    for (const candidate of this.candidates) {
      demand[candidate.category]++;
    }
    const remainingMs = Math.max(
      0,
      windowClosesAt(schedule, this.now()).getTime() - this.now().getTime(),
    );
    const capacity = Math.ceil(remainingMs / (schedule.intervalSeconds * 1000));
    await this.progress.prepareDay(
      this.dayKey,
      allocateCapacity(demand, capacity),
    );
  }

  takeIssues() {
    const issues = this.issues;
    this.issues = [];

    return issues;
  }

  async next(): Promise<QueueResult> {
    const schedule = this.requireSchedule();
    const globalReadyAt = await this.pacing.globalReadyAt(
      schedule.intervalSeconds,
    );
    if (globalReadyAt > this.now().getTime()) {
      return { waitUntil: new Date(globalReadyAt) };
    }
    const mailboxState = await this.mailboxes.getState();
    const progress = await this.progress.read();
    if (!progress.day || progress.day.key !== this.dayKey) {
      throw new Error('Daily queue state changed. Start a fresh run.');
    }

    const ready = new Map<QueueCategory, QueueSelection>();
    const oldestQueueAge: Partial<Record<QueueCategory, number>> = {};
    let earliestCooldown: number | null = null;
    let hasUnavailableOwner = false;

    for (const category of QUEUE_CATEGORIES) {
      const categoryCandidates = this.candidates.filter(
        (candidate) => candidate.category === category,
      );
      for (const candidate of categoryCandidates) {
        const sender = await this.pacing.resolve(
          candidate,
          mailboxState.mailboxes,
          progress.mailboxLastConfirmedAt,
        );
        if ('waitUntil' in sender) {
          earliestCooldown = Math.min(
            earliestCooldown ?? sender.waitUntil,
            sender.waitUntil,
          );
          continue;
        }
        if ('mailbox' in sender) {
          ready.set(category, { ...candidate, ...sender, dayKey: this.dayKey });
          oldestQueueAge[category] = candidate.queuedAt;
          break;
        }
        hasUnavailableOwner = true;
      }
    }

    const available = new Set(ready.keys());
    const smooth = nextSmoothCategory(
      progress.day.allocation,
      progress.day.confirmed,
      progress.day.current,
      available,
    );
    const category =
      smooth?.category ?? redistributionCategory(available, oldestQueueAge);
    if (category) {
      const cachedSelection = ready.get(category)!;
      const refreshed = await this.refreshSelection(cachedSelection);
      if ('rejected' in refreshed) {
        return refreshed;
      }
      const selection = refreshed;
      const currentWeights = smooth?.current ?? progress.day.current;
      await this.progress.advance(category, currentWeights);
      this.candidates = this.candidates.filter(
        (candidate) => candidate.draft.id !== selection.draft.id,
      );

      return selection;
    }
    if (earliestCooldown !== null) {
      return { waitUntil: new Date(earliestCooldown) };
    }
    if (hasUnavailableOwner) {
      return {
        blocked:
          'Remaining drafts require an unavailable owner mailbox. Reconnect it before another run; no conversation was rerouted.',
      };
    }

    return null;
  }

  async assertSubmissionAllowed(interaction: Interaction) {
    const schedule = this.requireSchedule();
    await this.pacing.assertGlobalReady(schedule.intervalSeconds);
    await this.pacing.assertReady(interaction.mailboxId!);

    const issueStart = this.issues.length;
    const draft = await this.interactions.findDraftById(interaction.id);
    if (!draft) {
      throw new Error(
        'Draft was deleted after selection. No email was submitted.',
      );
    }
    const candidate = await this.resolveCandidate(draft, this.runStartedAt);
    const freshIssues = this.issues.splice(issueStart);
    if (
      !candidate ||
      candidate.category !== interaction.queueCategory ||
      candidate.prospect.email !== interaction.email ||
      candidate.draft.subject !== interaction.subject ||
      candidate.draft.message !== interaction.message ||
      candidate.draft.createdAt !== interaction.createdAt
    ) {
      throw new Error(
        freshIssues[0]?.message ??
          'Draft, recipient or conversation changed after selection. Draft unchanged; no email submitted.',
      );
    }
    if (
      candidate.root?.gmailMessageId !== interaction.gmailOriginalMessageId ||
      candidate.draft.gmailThreadId !== (interaction.gmailThreadId ?? '')
    ) {
      throw new Error(
        'Conversation identity changed after selection. Draft unchanged; no email submitted.',
      );
    }
    const mailboxState = await this.mailboxes.getState();
    await this.pacing.assertSelectedMailbox(
      candidate,
      interaction.mailboxId!,
      mailboxState.mailboxes,
    );
  }

  private requireSchedule() {
    if (!this.schedule || !this.runStartedAt) {
      throw new Error('Daily queue was not prepared. Start a fresh run.');
    }

    return this.schedule;
  }

  private async refreshSelection(
    cached: QueueSelection,
  ): Promise<
    QueueSelection | { rejected: { interactionId: string; message: string } }
  > {
    const issueStart = this.issues.length;
    const draft = await this.interactions.findDraftById(cached.draft.id);
    if (!draft) {
      this.removeCandidate(cached.draft.id);

      return {
        rejected: {
          interactionId: cached.draft.id,
          message: 'Draft was deleted after the queue was prepared.',
        },
      };
    }
    const candidate = await this.resolveCandidate(draft, this.runStartedAt);
    const freshIssues = this.issues.splice(issueStart);
    if (!candidate) {
      this.removeCandidate(cached.draft.id);

      return {
        rejected: freshIssues[0] ?? {
          interactionId: cached.draft.id,
          message:
            'Draft is no longer eligible and was skipped without sending.',
        },
      };
    }
    if (!this.matchesCachedCandidate(candidate, cached)) {
      this.removeCandidate(cached.draft.id);

      return {
        rejected: {
          interactionId: cached.draft.id,
          message:
            'Draft, recipient or conversation changed after the queue was prepared. It was skipped without sending.',
        },
      };
    }
    this.candidates = this.candidates.map((item) =>
      item.draft.id === candidate.draft.id ? candidate : item,
    );
    this.sortCandidates();

    return {
      ...candidate,
      mailbox: cached.mailbox,
      dayKey: cached.dayKey,
      ...(cached.originalMessageId
        ? { originalMessageId: cached.originalMessageId }
        : {}),
    };
  }

  private async resolveCandidate(
    draft: DraftCandidate,
    runStartedAt: string,
  ): Promise<QueueCandidate | null> {
    if (
      draft.status !== 'Draft' ||
      draft.direction !== 'Outbound' ||
      draft.channel !== 'Email' ||
      !draft.subject.trim() ||
      !draft.message.trim()
    ) {
      return this.reject(
        draft,
        'Interaction is not a sendable outbound email Draft.',
      );
    }
    if (
      !Number.isFinite(Date.parse(draft.createdAt)) ||
      Date.parse(draft.createdAt) > Date.parse(runStartedAt)
    ) {
      return this.reject(
        draft,
        'Draft Created At is invalid or later than the fixed run cutoff.',
      );
    }
    if (draft.prospectIds.length !== 1 || !draft.prospectIds[0]) {
      return this.reject(draft, 'Draft must link to exactly one Prospect.');
    }
    const prospect = await this.prospects.findQueueContextById(
      draft.prospectIds[0],
    );
    if (prospect.doNotContact || !z.email().safeParse(prospect.email).success) {
      return this.reject(
        draft,
        prospect.doNotContact
          ? 'Prospect is marked Do Not Contact.'
          : 'Prospect email is missing or invalid.',
      );
    }

    try {
      conversationRootId(draft);
    } catch (error) {
      return this.reject(
        draft,
        error instanceof Error ? error.message : 'Draft ownership is invalid.',
      );
    }
    if (draft.type === INITIAL_MESSAGE_TYPE) {
      return {
        draft,
        prospect,
        category: 'initial',
        queuedAt: Date.parse(draft.createdAt),
      };
    }
    if (!isFollowUpType(draft.type)) {
      return this.reject(
        draft,
        `Unsupported outbound Type ${draft.type || '(blank)'}.`,
      );
    }

    const history = await this.interactions.findHistoryByIds(
      prospect.interactionIds,
    );
    const metadata = this.resolveFollowUpMetadata(draft, history);
    if (!metadata) {
      return this.reject(
        draft,
        'Follow-up category or conversation history is ambiguous. Use numbered Types with consecutive verified history.',
      );
    }

    return { draft, prospect, ...metadata };
  }

  private reject(draft: DraftCandidate, message: string): null {
    this.issues.push({ interactionId: draft.id, message });

    return null;
  }

  private resolveFollowUpMetadata(
    draft: DraftCandidate,
    history: HistoryInteraction[],
  ): Pick<QueueCandidate, 'category' | 'queuedAt' | 'root'> | null {
    const root = this.findValidRoot(draft, history);
    if (!root || !this.hasSingleCompletedInitial(history, root)) {
      return null;
    }
    const completed = this.completedConversation(history, root.id);
    if (
      !this.hasConsistentOwnership(draft, root, completed) ||
      !this.hasDistinctOrderedSentAt(completed, root.id) ||
      !this.hasConsecutiveFollowUpTypes(completed) ||
      this.hasReplySinceRoot(history, root) ||
      this.hasAnotherFollowUpDraft(history, draft.id)
    ) {
      return null;
    }
    const stepNumber =
      completed.filter((item) => isFollowUpType(item.type)).length + 1;
    if (stepNumber < 1 || stepNumber > 3) {
      return null;
    }
    if (numberedFollowUpStep(draft.type) !== stepNumber) {
      return null;
    }

    return {
      category: `followUp${stepNumber}` as QueueCategory,
      queuedAt: Date.parse(draft.createdAt),
      root,
    };
  }

  private hasConsecutiveFollowUpTypes(completed: HistoryInteraction[]) {
    const followUps = completed.filter((item) => isFollowUpType(item.type));

    return followUps.every(
      (item, index) => numberedFollowUpStep(item.type) === index + 1,
    );
  }

  private findValidRoot(draft: DraftCandidate, history: HistoryInteraction[]) {
    const root = history.find(
      (item) => item.id === draft.initialInteractionIds[0],
    );

    return root &&
      root.type === INITIAL_MESSAGE_TYPE &&
      root.mailboxIds.length === 1 &&
      root.initialInteractionIds.length === 0 &&
      root.prospectIds.length === 1 &&
      root.prospectIds[0] === draft.prospectIds[0]
      ? root
      : null;
  }

  private hasSingleCompletedInitial(
    history: HistoryInteraction[],
    root: HistoryInteraction,
  ) {
    const initials = history.filter(
      (item) =>
        item.direction === 'Outbound' &&
        item.channel === 'Email' &&
        item.status === 'Completed' &&
        item.type === INITIAL_MESSAGE_TYPE,
    );

    return initials.length === 1 && initials[0]?.id === root.id;
  }

  private completedConversation(history: HistoryInteraction[], rootId: string) {
    return history
      .filter(
        (item) =>
          item.direction === 'Outbound' &&
          item.channel === 'Email' &&
          item.status === 'Completed' &&
          (item.id === rootId || item.initialInteractionIds[0] === rootId),
      )
      .sort(
        (left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt),
      );
  }

  private hasConsistentOwnership(
    draft: DraftCandidate,
    root: HistoryInteraction,
    completed: HistoryInteraction[],
  ) {
    return (
      Boolean(root.gmailMessageId) &&
      Boolean(root.gmailThreadId) &&
      draft.gmailThreadId === root.gmailThreadId &&
      draft.subject === root.subject &&
      completed.every(
        (item) =>
          item.prospectIds.length === 1 &&
          item.prospectIds[0] === draft.prospectIds[0] &&
          item.mailboxIds.length === 1 &&
          item.mailboxIds[0] === root.mailboxIds[0] &&
          item.gmailThreadId === root.gmailThreadId &&
          (item.id === root.id ||
            (item.initialInteractionIds.length === 1 &&
              item.initialInteractionIds[0] === root.id &&
              isFollowUpType(item.type))),
      )
    );
  }

  private hasDistinctOrderedSentAt(
    completed: HistoryInteraction[],
    rootId: string,
  ) {
    const sentTimes = completed.map((item) => Date.parse(item.sentAt));
    if (
      completed[0]?.id !== rootId ||
      sentTimes.some((sentAt) => !Number.isFinite(sentAt)) ||
      new Set(sentTimes).size !== sentTimes.length
    ) {
      return false;
    }

    return sentTimes.every(
      (sentAt, index) => index === 0 || sentAt > sentTimes[index - 1]!,
    );
  }

  private hasReplySinceRoot(
    history: HistoryInteraction[],
    root: HistoryInteraction,
  ) {
    return history.some((item) => {
      if (item.direction !== 'Inbound' || item.status !== 'Completed') {
        return false;
      }
      const receivedAt = Date.parse(item.receivedAt);

      return (
        !Number.isFinite(receivedAt) || receivedAt >= Date.parse(root.sentAt)
      );
    });
  }

  private hasAnotherFollowUpDraft(
    history: HistoryInteraction[],
    draftId: string,
  ) {
    return history.some(
      (item) =>
        isFollowUpType(item.type) &&
        item.status === 'Draft' &&
        item.id !== draftId,
    );
  }

  private removeCandidate(interactionId: string) {
    this.candidates = this.candidates.filter(
      (candidate) => candidate.draft.id !== interactionId,
    );
  }

  private matchesCachedCandidate(
    candidate: QueueCandidate,
    cached: QueueCandidate,
  ) {
    return (
      candidate.category === cached.category &&
      candidate.queuedAt === cached.queuedAt &&
      candidate.draft.subject === cached.draft.subject &&
      candidate.draft.message === cached.draft.message &&
      candidate.draft.gmailThreadId === cached.draft.gmailThreadId &&
      candidate.prospect.email === cached.prospect.email &&
      candidate.root?.id === cached.root?.id &&
      candidate.root?.gmailMessageId === cached.root?.gmailMessageId
    );
  }

  private sortCandidates() {
    this.candidates.sort((left, right) =>
      compareQueueAge(
        { queuedAt: left.queuedAt, id: left.draft.id },
        { queuedAt: right.queuedAt, id: right.draft.id },
      ),
    );
  }
}
