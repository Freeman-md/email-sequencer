import 'server-only';

import { reconciliationGuidance } from '@/infrastructure/send-attempts/store';

import {
  allocateMailbox,
  conversationRootId,
  resolveFollowUpMailbox,
} from '../policies/sender';

import type { DashboardState, InteractionSummary } from '../../types';
import type { IConnectionsService } from '../interfaces/connections-service.interface';
import type {
  ISenderMailboxes,
  SenderMailbox,
} from '../interfaces/mailboxes.interface';
import type { ISequencerService } from '../interfaces/sequencer-service.interface';
import type { SequencerRuntime } from '../runtime/sequencer-runtime';
import type { Interaction } from '../types/interaction';
import type { EmailSender } from '@/infrastructure/email/interfaces/sender.interface';
import type { SendResult } from '@/infrastructure/email/types/send-result';
import type {
  ISendAttemptStore,
  SendAttempt,
} from '@/infrastructure/send-attempts/store';
import type {
  DraftCandidate,
  SendingInteraction,
  IDraftQueueRepository,
} from '@/modules/outreach/interactions';
import type { IProspectContactRepository } from '@/modules/outreach/prospects';

export class SequencerService implements ISequencerService {
  constructor(
    private readonly interactions: IDraftQueueRepository,
    private readonly prospects: IProspectContactRepository,
    private readonly sender: EmailSender,
    private readonly connections: IConnectionsService,
    private readonly runtime: SequencerRuntime,
    private readonly mailboxes: ISenderMailboxes,
    private readonly attempts: ISendAttemptStore,
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
    };
  }

  start(intervalSeconds: number) {
    const runStartedAt = this.runtime.begin(intervalSeconds);
    void this.execute(runStartedAt);

    return this.snapshot();
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

  private async nextInteraction(
    runStartedAt: string,
  ): Promise<Interaction | null> {
    // Recipient email lives on a linked table, so resolve one candidate at a time.
    while (!this.runtime.isStopping()) {
      const excluded = this.runtime.excludedIds();
      const candidate = await this.interactions.findNextDraft(
        runStartedAt,
        excluded,
      );

      if (this.runtime.isStopping() || !candidate) {
        return null;
      }
      const prospectId = this.validateQueueCandidate(
        candidate,
        runStartedAt,
        excluded,
      );
      this.runtime.exclude(candidate.id);
      const prospect = await this.prospects.findContactById(prospectId);

      if (this.runtime.isStopping()) {
        return null;
      }
      if (prospect.doNotContact) {
        this.runtime.rejected({
          kind: 'definite',
          interactionId: candidate.id,
          message:
            'Prospect is marked Do Not Contact. Draft unchanged; no email sent.',
        });
        continue;
      }
      if (
        !prospect.email ||
        !candidate.subject.trim() ||
        !candidate.message.trim()
      ) {
        continue;
      }

      const sender = await this.resolveConversationSender(candidate);
      if (!sender) {
        continue;
      }
      if (this.runtime.isStopping()) {
        return null;
      }

      return {
        id: candidate.id,
        prospect: prospect.name || prospect.email,
        company: prospect.company,
        email: prospect.email,
        subject: candidate.subject,
        message: candidate.message,
        gmailThreadId: candidate.gmailThreadId || undefined,
        isFollowUp: candidate.type === 'Follow-up',
        createdAt: candidate.createdAt,
        mailboxId: sender.mailbox.id,
        mailboxEmail: sender.mailbox.email,
        ...(sender.originalMessageId
          ? { gmailOriginalMessageId: sender.originalMessageId }
          : {}),
      };
    }

    return null;
  }

  private validateQueueCandidate(
    candidate: DraftCandidate,
    runStartedAt: string,
    excluded: ReadonlySet<string>,
  ): string {
    if (
      excluded.has(candidate.id) ||
      !Number.isFinite(Date.parse(candidate.createdAt)) ||
      Date.parse(candidate.createdAt) > Date.parse(runStartedAt) ||
      candidate.status !== 'Draft' ||
      candidate.direction !== 'Outbound' ||
      candidate.channel !== 'Email'
    ) {
      throw new Error(
        `Airtable returned an ineligible or already processed Interaction (${candidate.id}). Run stopped without sending.`,
      );
    }
    const [prospectId] = candidate.prospectIds;
    if (candidate.prospectIds.length !== 1 || !prospectId) {
      throw new Error(
        `Interaction ${candidate.id} must link to exactly one Prospect. Correct the relationship before sending.`,
      );
    }

    return prospectId;
  }

  private async resolveConversationSender(
    candidate: DraftCandidate,
  ): Promise<{ mailbox: SenderMailbox; originalMessageId?: string } | null> {
    let rootId: string | undefined;

    try {
      rootId = conversationRootId(candidate);
    } catch (error) {
      this.rejectOwnership(candidate.id, error);

      return null;
    }
    const state = await this.mailboxes.getState();
    if (!rootId) {
      const cursor = (await this.attempts.read()).lastAllocatedMailboxId;

      return { mailbox: allocateMailbox(state.mailboxes, cursor) };
    }

    try {
      const root = await this.interactions.findById(rootId);

      return {
        mailbox: resolveFollowUpMailbox(candidate, root, state.mailboxes),
        originalMessageId: root.gmailMessageId,
      };
    } catch (error) {
      this.rejectOwnership(candidate.id, error);

      return null;
    }
  }

  private rejectOwnership(interactionId: string, error: unknown) {
    this.runtime.rejected({
      kind: 'definite',
      interactionId,
      message:
        error instanceof Error
          ? error.message
          : 'Original conversation cannot be verified. Draft unchanged.',
    });
  }

  private async execute(runStartedAt: string) {
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
      await this.connections.requireReady();

      while (!this.runtime.isStopping()) {
        this.runtime.fetching();
        const interaction = await this.nextInteraction(runStartedAt);

        if (this.runtime.isStopping()) {
          break;
        }
        if (!interaction) {
          this.runtime.completed();
          break;
        }

        if (!(await this.sendInteraction(interaction))) {
          break;
        }

        await this.runtime.wait();
      }
    } catch (error) {
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

  private async sendInteraction(interaction: Interaction): Promise<boolean> {
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
      },
      !interaction.isFollowUp,
    );
    if (this.runtime.isStopping()) {
      await this.attempts.resolve(attempt.id);

      return false;
    }
    this.runtime.sending(summary);
    const result = await this.submit(interaction);
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
}
