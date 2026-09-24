import 'server-only';

import { reconciliationGuidance } from '@/infrastructure/send-attempts/store';
import {
  triggerKey,
  windowOpen,
  windowClosesAt,
} from '@/modules/outreach/schedules';

import type { DashboardState, InteractionSummary } from '../../types';
import type { IConnectionsService } from '../interfaces/connections-service.interface';
import type { ISequencerService } from '../interfaces/sequencer-service.interface';
import type { SequencerRuntime } from '../runtime/sequencer-runtime';
import type { Interaction } from '../types/interaction';
import type { ISendingQueue } from '../types/queue';
import type { EmailSender } from '@/infrastructure/email/interfaces/sender.interface';
import type { SendResult } from '@/infrastructure/email/types/send-result';
import type {
  ISendAttemptStore,
  SendAttempt,
} from '@/infrastructure/send-attempts/store';
import type { ISendingProgressStore } from '@/infrastructure/sending-progress/store';
import type {
  SendingInteraction,
  IDraftQueueRepository,
} from '@/modules/outreach/interactions';
import type { ISendingSchedule, Schedule } from '@/modules/outreach/schedules';

class RunStoppedBeforeSubmissionError extends Error {}

export class SequencerService implements ISequencerService {
  constructor(
    private readonly interactions: Pick<
      IDraftQueueRepository,
      'confirmSent' | 'findById'
    >,
    private readonly sender: EmailSender,
    private readonly connections: IConnectionsService,
    private readonly runtime: SequencerRuntime,
    private readonly attempts: ISendAttemptStore,
    private readonly schedules: ISendingSchedule,
    private readonly progress: ISendingProgressStore,
    private readonly queue: ISendingQueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  snapshot() {
    return this.runtime.snapshot();
  }

  isActive() {
    return this.runtime.isActive();
  }

  async getDashboardState(): Promise<DashboardState> {
    const connections = await this.connections.getState();

    return {
      ...connections,
      run: this.snapshot(),
      serverNow: this.now().toISOString(),
      pendingAttempt: (await this.attempts.read()).pending,
      schedule: await this.schedules.status(),
    };
  }

  start() {
    const runStartedAt = this.runtime.begin(1200);
    void this.execute(runStartedAt);

    return this.snapshot();
  }

  async startAutomatic(key: string, minute: number) {
    const runStartedAt = this.runtime.begin(1200);
    void this.execute(runStartedAt, { key, minute });
  }

  stop() {
    return this.runtime.stop();
  }

  async reconcile(attemptId: string, outcome: 'sent' | 'not-sent') {
    this.runtime.beginConnectionChange();

    try {
      const pending = (await this.attempts.read()).pending;
      if (!pending || pending.id !== attemptId) {
        throw new Error(
          'This reconciliation no longer matches the unresolved attempt. Refresh before continuing.',
        );
      }
      if (outcome === 'not-sent' && pending.confirmation) {
        throw new Error(
          'Gmail confirmed this send. Confirm its Airtable completion instead; it cannot be marked not sent.',
        );
      }
      if (outcome === 'sent') {
        const saved = await this.interactions.findById(pending.interactionId);
        this.verifyReconciledCompletion(saved, pending);
        await this.recordProgress({
          ...pending,
          confirmation: pending.confirmation ?? {
            sentAt: saved.sentAt,
            gmailMessageId: saved.gmailMessageId,
            gmailThreadId: saved.gmailThreadId,
          },
        });
      }
      await this.attempts.resolve(pending.id);
    } finally {
      this.runtime.endConnectionChange();
    }
  }

  private verifyReconciledCompletion(
    saved: SendingInteraction,
    attempt: SendAttempt,
  ) {
    const known = attempt.confirmation;
    const completed =
      saved.status === 'Completed' &&
      Number.isFinite(Date.parse(saved.sentAt)) &&
      saved.gmailMessageId &&
      saved.gmailThreadId;
    const sameSender =
      saved.mailboxIds.length === 1 &&
      saved.mailboxIds[0] === attempt.mailboxId;
    const sameConfirmation =
      !known ||
      (saved.gmailMessageId === known.gmailMessageId &&
        saved.gmailThreadId === known.gmailThreadId &&
        Date.parse(saved.sentAt) === Date.parse(known.sentAt));
    if (!completed || !sameSender || !sameConfirmation) {
      throw new Error(
        'Airtable completion and sender attribution do not match this attempt. Repair all completion fields before reconciling.',
      );
    }
  }

  private async execute(
    runStartedAt: string,
    occurrence?: { key: string; minute: number },
  ) {
    try {
      const pending = (await this.attempts.read()).pending;
      if (pending) {
        this.runtime.halt({
          kind: 'reconciliation',
          interactionId: pending.interactionId,
          message: reconciliationGuidance(pending),
        });

        return;
      }
      const schedule = await this.prepareRunSchedule(occurrence);
      await this.queue.prepare(schedule, runStartedAt, () =>
        this.runtime.isStopping(),
      );
      for (const issue of this.queue.takeIssues()) {
        this.runtime.rejected({ kind: 'definite', ...issue });
      }

      while (!this.runtime.isStopping()) {
        await this.assertSubmissionAllowed(schedule);
        this.runtime.fetching();
        const queued = await this.queue.next();

        if (this.runtime.isStopping()) {
          break;
        }
        if (!queued) {
          this.runtime.completed();
          break;
        }
        if ('waitUntil' in queued) {
          await this.runtime.waitUntil(
            queued.waitUntil,
            windowClosesAt(schedule, this.now()),
          );
          continue;
        }
        if ('blocked' in queued) {
          this.runtime.halt({ kind: 'system', message: queued.blocked });
          break;
        }
        if ('rejected' in queued) {
          this.runtime.rejected({ kind: 'definite', ...queued.rejected });
          continue;
        }
        const interaction: Interaction = {
          id: queued.draft.id,
          prospect: queued.prospect.name || queued.prospect.email,
          company: queued.prospect.company,
          email: queued.prospect.email,
          subject: queued.draft.subject,
          message: queued.draft.message,
          gmailThreadId: queued.draft.gmailThreadId || undefined,
          isFollowUp: queued.category !== 'initial',
          createdAt: queued.draft.createdAt,
          mailboxId: queued.mailbox.id,
          mailboxEmail: queued.mailbox.email,
          queueCategory: queued.category,
          queueDayKey: queued.dayKey,
          ...(queued.originalMessageId
            ? { gmailOriginalMessageId: queued.originalMessageId }
            : {}),
        };

        if (!(await this.sendInteraction(interaction, schedule))) {
          break;
        }

        await this.runtime.wait(windowClosesAt(schedule, this.now()));
      }
    } catch (error) {
      if (error instanceof RunStoppedBeforeSubmissionError) {
        return;
      }
      this.runtime.halt({
        kind: 'system',
        message:
          error instanceof Error
            ? error.message
            : 'Run stopped because a service is unavailable.',
      });
    } finally {
      this.runtime.finish();
    }
  }

  private async prepareRunSchedule(occurrence?: {
    key: string;
    minute: number;
  }) {
    await this.connections.requireReady();
    const schedule = await this.schedules.capture();
    await this.assertSubmissionAllowed(schedule);
    this.runtime.configureInterval(schedule.intervalSeconds);
    if (occurrence) {
      if (
        triggerKey(schedule, this.now()) !== occurrence.key ||
        Math.floor(this.now().getTime() / 60000) * 60000 !== occurrence.minute
      ) {
        throw new Error(
          'Automatic trigger minute was missed. Occurrence skipped.',
        );
      }
      await this.schedules.claim(schedule, occurrence.key);
      if (
        Math.floor(this.now().getTime() / 60000) * 60000 !==
        occurrence.minute
      ) {
        throw new Error(
          'Claim completed after the trigger minute. Occurrence skipped; never replay.',
        );
      }
    }

    return schedule;
  }

  private async assertSubmissionAllowed(schedule: Schedule) {
    await this.schedules.verify(schedule);
    if (this.runtime.isStopping()) {
      throw new RunStoppedBeforeSubmissionError(
        'Run stopped before submission. Draft unchanged.',
      );
    }
    this.assertRunWindowOpen(schedule);
  }

  private assertRunWindowOpen(schedule: Schedule) {
    if (!windowOpen(schedule, this.now())) {
      throw new Error(
        'Sending window closed before submission. Draft unchanged.',
      );
    }
  }

  private async sendInteraction(
    interaction: Interaction,
    schedule: Schedule,
  ): Promise<boolean> {
    await this.assertSubmissionAllowed(schedule);
    if (!interaction.mailboxId || !interaction.mailboxEmail) {
      throw new Error(
        'No verified sender selected. Run stopped without sending.',
      );
    }
    const summary: InteractionSummary = {
      id: interaction.id,
      prospect: interaction.prospect,
      company: interaction.company,
      email: interaction.email,
      subject: interaction.subject,
      createdAt: interaction.createdAt,
      mailboxId: interaction.mailboxId,
      mailboxEmail: interaction.mailboxEmail,
    };
    const attempt = await this.attempts.reserve(
      {
        interactionId: interaction.id,
        mailboxId: interaction.mailboxId,
        mailboxEmail: interaction.mailboxEmail,
        ...(interaction.queueCategory
          ? { queueCategory: interaction.queueCategory }
          : {}),
        ...(interaction.queueDayKey
          ? { queueDayKey: interaction.queueDayKey }
          : {}),
      },
      !interaction.isFollowUp,
    );
    if (this.runtime.isStopping()) {
      await this.attempts.resolve(attempt.id);

      return false;
    }
    this.runtime.sending(summary);
    const result = await this.submit({
      ...interaction,
      beforeSubmit: async () => {
        await this.queue.assertSubmissionAllowed(interaction);
        await this.assertSubmissionAllowed(schedule);
      },
    });
    if (result.kind === 'uncertain') {
      this.runtime.halt({
        ...result,
        interactionId: interaction.id,
        message: `${result.message} ${reconciliationGuidance(attempt)}`,
      });

      return false;
    }
    if (result.kind === 'definite') {
      await this.attempts.resolve(attempt.id);
      this.runtime.rejected({ ...result, interactionId: interaction.id });
      if (result.submissionPrevented) {
        if (!this.runtime.isStopping()) {
          this.runtime.halt({ kind: 'system', message: result.message });
        }

        return false;
      }

      return true;
    }
    this.runtime.sent(summary, result.sentAt);

    return this.persistConfirmedSend(interaction, attempt, result);
  }

  private async submit(interaction: Interaction): Promise<SendResult> {
    try {
      return await this.sender.send(interaction);
    } catch {
      return {
        kind: 'uncertain',
        message:
          'Sending ended without a confirmed outcome. Check Gmail manually.',
      };
    }
  }

  private async persistConfirmedSend(
    interaction: Interaction,
    attempt: SendAttempt,
    result: Extract<SendResult, { kind: 'confirmed' }>,
  ): Promise<boolean> {
    try {
      await this.attempts.confirm(attempt.id, result);
      if (
        interaction.isFollowUp &&
        result.gmailThreadId !== interaction.gmailThreadId
      ) {
        throw new Error('Gmail confirmed a different conversation thread.');
      }
      await this.interactions.confirmSent(interaction.id, {
        sentAt: result.sentAt,
        gmailMessageId: result.gmailMessageId,
        gmailThreadId: result.gmailThreadId,
        mailboxId: attempt.mailboxId,
      });
      await this.recordProgress({ ...attempt, confirmation: result });
      await this.attempts.resolve(attempt.id);

      return true;
    } catch {
      const confirmed: SendAttempt = { ...attempt, confirmation: result };
      const reason =
        interaction.isFollowUp &&
        result.gmailThreadId !== interaction.gmailThreadId
          ? 'Gmail confirmed a different conversation thread. Airtable draft unchanged; reconcile the actual send.'
          : 'Gmail succeeded but durable confirmation or Airtable completion was not confirmed.';
      this.runtime.halt({
        kind: 'reconciliation',
        interactionId: interaction.id,
        message: `${reason} ${reconciliationGuidance(confirmed)}`,
      });

      return false;
    }
  }

  private async recordProgress(attempt: SendAttempt) {
    if (!attempt.confirmation) {
      throw new Error('Confirmed send is missing durable Gmail identifiers.');
    }
    if (!attempt.queueDayKey && !attempt.queueCategory) {
      // Version-1 attempts predate weighted queue accounting. They remain
      // reconcilable, but must not be assigned speculative historical progress.
      return;
    }
    if (!attempt.queueDayKey || !attempt.queueCategory) {
      throw new Error(
        'Confirmed send is missing durable queue accounting metadata. Repair progress before reconciling.',
      );
    }
    await this.progress.recordConfirmed({
      attemptId: attempt.id,
      dayKey: attempt.queueDayKey,
      category: attempt.queueCategory,
      mailboxId: attempt.mailboxId,
      sentAt: attempt.confirmation.sentAt,
    });
  }
}
