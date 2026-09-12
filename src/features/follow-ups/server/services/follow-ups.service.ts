import 'server-only';
import { initialPreparationState } from '../../types/preparation';

import { assessFollowUp } from './eligibility';

import type { FollowUpStep } from '../../constants/steps';
import type { ICampaignsRepository } from '../interfaces/campaigns-repository.interface';
import type { IFollowUpsService } from '../interfaces/follow-ups-service.interface';
import type { IFollowUpGenerator } from '../interfaces/generator.interface';
import type { IInteractionsRepository } from '../interfaces/interactions-repository.interface';
import type { IProspectsRepository } from '../interfaces/prospects-repository.interface';

export class FollowUpsService implements IFollowUpsService {
  private state = initialPreparationState();

  constructor(
    private readonly prospects: IProspectsRepository,
    private readonly interactions: IInteractionsRepository,
    private readonly campaigns: ICampaignsRepository,
    private readonly generator: IFollowUpGenerator,
    private readonly steps: readonly FollowUpStep[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  snapshot() {
    return structuredClone(this.state);
  }

  start() {
    if (this.state.status === 'running')
      throw new Error('Follow-up preparation is already running.');
    if (
      !this.steps.length ||
      this.steps.some(
        (step, index) =>
          step.number !== index + 1 ||
          !Number.isFinite(step.waitDays) ||
          step.waitDays < 0 ||
          !step.guidance.trim(),
      )
    )
      throw new Error(
        'Follow-up steps must be consecutive, with valid delays and guidance.',
      );
    this.state = {
      ...initialPreparationState(),
      status: 'running',
      startedAt: this.now().toISOString(),
    };
    void this.execute();

    return this.snapshot();
  }

  private skip(reason: string) {
    this.state.skipped++;
    this.state.reasons[reason] = (this.state.reasons[reason] ?? 0) + 1;
  }

  private async execute() {
    try {
      let offset: string | undefined;
      const seenOffsets = new Set<string>();
      const seenProspects = new Set<string>();
      do {
        const page = await this.prospects.page(offset);
        for (const id of page.ids) {
          if (seenProspects.has(id)) continue;
          seenProspects.add(id);
          await this.prepare(id);
        }
        offset = page.offset;
        if (offset && seenOffsets.has(offset))
          throw new Error('Repeated Airtable page.');
        if (offset) seenOffsets.add(offset);
      } while (offset);
      this.state.status = 'completed';
    } catch {
      this.state.status = 'error';
      this.state.error =
        'Preparation stopped because candidate records could not be read. Check Airtable access and field configuration. Drafts already confirmed remain saved.';
    }
  }

  private async prepare(id: string) {
    this.state.checked++;
    let phase: 'read' | 'generate' | 'write' = 'read';

    try {
      const prospect = await this.prospects.findById(id);
      const history = await this.interactions.history(prospect.interactionIds);
      const assessment = assessFollowUp(
        prospect,
        history,
        this.steps,
        Date.parse(this.state.startedAt!),
      );
      if (!assessment.due) {
        this.skip(assessment.reason);

        return;
      }
      const campaign = await this.campaigns.findById(prospect.campaignIds[0]!);
      if (
        !campaign.name.trim() ||
        !String(campaign.guidance.Offer ?? '').trim()
      ) {
        this.skip('Missing Campaign name or offer');

        return;
      }
      this.state.eligible++;
      phase = 'generate';
      const message = (
        await this.generator.generate({
          prospect,
          campaign,
          history,
          due: assessment.due,
        })
      ).trim();
      if (
        !message ||
        message.length > 5000 ||
        message.split(/\s+/).length > 180 ||
        /^subject:/im.test(message) ||
        message.includes('```')
      )
        throw new Error('Invalid generated body');
      phase = 'read';
      // Generation may take time. Read the reciprocal links again to detect new
      // replies, outbound sends or Drafts before the only persistent mutation.
      const fresh = await this.prospects.findById(id);
      const freshHistory = await this.interactions.history(
        fresh.interactionIds,
      );
      const recheck = assessFollowUp(
        fresh,
        freshHistory,
        this.steps,
        Date.parse(this.state.startedAt!),
      );
      if (!recheck.due) {
        this.skip(recheck.reason);

        return;
      }
      if (
        JSON.stringify(fresh) !== JSON.stringify(prospect) ||
        JSON.stringify(
          [...freshHistory].sort((a, b) => a.id.localeCompare(b.id)),
        ) !==
          JSON.stringify([...history].sort((a, b) => a.id.localeCompare(b.id)))
      ) {
        this.skip('Prospect or conversation changed during generation');

        return;
      }
      phase = 'write';
      await this.interactions.createDraft({
        prospectId: id,
        subject: recheck.due.original.subject,
        message,
        gmailThreadId: recheck.due.original.gmailThreadId,
      });
      this.state.drafted++;
    } catch {
      const message =
        phase === 'write'
          ? 'Draft creation was not confirmed. Check this Prospect in Airtable before another run; no write was retried.'
          : phase === 'generate'
            ? 'Generation failed or returned an invalid body. No Draft created; check AI configuration and availability.'
            : 'Cannot read complete Prospect, Campaign or Interaction context. Check Airtable access, fields and timestamps.';
      this.skip(
        phase === 'write'
          ? 'Draft write not confirmed'
          : phase === 'generate'
            ? 'Generation failed'
            : 'Context unavailable',
      );
      this.state.errorCount++;
      this.state.errors = [
        ...this.state.errors.slice(-19),
        { prospectId: id, message },
      ];
    }
  }
}
