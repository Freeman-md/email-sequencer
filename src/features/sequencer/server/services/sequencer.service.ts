import 'server-only';

import type { DashboardState } from '../../types';
import type { IConnectionsService } from '../interfaces/connections-service.interface';
import type { IInteractionsRepository } from '../interfaces/interactions-repository.interface';
import type { IProspectsRepository } from '../interfaces/prospects-repository.interface';
import type { ISequencerService } from '../interfaces/sequencer-service.interface';
import type { SequencerRuntime } from '../runtime/sequencer-runtime';
import type { Interaction } from '../types';
import type { EmailSender } from '@/infrastructure/email/interfaces/sender.interface';
import type { SendResult } from '@/infrastructure/email/types/send-result';

export class SequencerService implements ISequencerService {
  constructor(
    private readonly interactions: IInteractionsRepository,
    private readonly prospects: IProspectsRepository,
    private readonly sender: EmailSender,
    private readonly connections: IConnectionsService,
    private readonly runtime: SequencerRuntime,
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

  private async nextInteraction(
    runStartedAt: string,
  ): Promise<Interaction | null> {
    // Recipient email lives on a linked table, so resolve one candidate at a time.
    while (!this.runtime.isStopping()) {
      const excluded = this.runtime.excludedIds();
      const candidate = await this.interactions.next(runStartedAt, excluded);

      if (this.runtime.isStopping() || !candidate) return null;
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

      this.runtime.exclude(candidate.id);
      const prospect = await this.prospects.findById(prospectId);

      if (this.runtime.isStopping()) return null;
      if (
        !prospect.email ||
        !candidate.subject.trim() ||
        !candidate.message.trim()
      )
        continue;

      return {
        id: candidate.id,
        prospect: prospect.name || prospect.email,
        company: prospect.company,
        email: prospect.email,
        subject: candidate.subject,
        message: candidate.message,
        createdAt: candidate.createdAt,
      };
    }

    return null;
  }

  private async execute(runStartedAt: string) {
    try {
      await this.connections.requireReady();

      while (!this.runtime.isStopping()) {
        this.runtime.fetching();
        const interaction = await this.nextInteraction(runStartedAt);

        if (this.runtime.isStopping()) break;
        if (!interaction) {
          this.runtime.completed();
          break;
        }

        const summary = {
          id: interaction.id,
          prospect: interaction.prospect,
          company: interaction.company,
          email: interaction.email,
          subject: interaction.subject,
          createdAt: interaction.createdAt,
        };
        this.runtime.sending(summary);
        let result: SendResult;

        try {
          result = await this.sender.send(interaction);
        } catch {
          result = {
            kind: 'uncertain',
            message:
              'Sending ended without a confirmed outcome. Check Gmail manually.',
          };
        }

        if (result.kind === 'uncertain') {
          this.runtime.halt({ ...result, interactionId: interaction.id });
          break;
        }
        if (result.kind === 'definite') {
          this.runtime.rejected({ ...result, interactionId: interaction.id });
        } else {
          this.runtime.sent(summary, result.sentAt);

          try {
            await this.interactions.complete(interaction.id, result.sentAt);
          } catch {
            this.runtime.halt({
              kind: 'reconciliation',
              interactionId: interaction.id,
              message: `Gmail confirmed this send at ${result.sentAt}, but Airtable did not confirm the update. Set this Interaction to Completed with that Sent At before another run. Do not resend it.`,
            });
            break;
          }
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
}
