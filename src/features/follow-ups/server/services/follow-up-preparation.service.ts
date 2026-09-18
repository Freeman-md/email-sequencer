import 'server-only';

import { TextGenerationError } from '@/infrastructure/text-generation/error';

import { initialPreparationState } from '../../types/preparation';
import { assessFollowUp } from '../policies/follow-up-eligibility';
import { FOLLOW_UP_INSTRUCTIONS, followUpContext } from '../prompts/follow-up';

import type { FollowUpStep } from '../../constants/steps';
import type { IFollowUpPreparationService } from '../interfaces/follow-up-preparation-service.interface';
import type { GenerationContext } from '../types/follow-up';
import type { ITextGenerator } from '@/infrastructure/text-generation/interfaces/generator.interface';
import type { Campaign } from '@/modules/outreach/campaigns';
import type { ICampaignRepository } from '@/modules/outreach/campaigns';
import type {
  HistoryInteraction,
  IFollowUpDraftRepository,
} from '@/modules/outreach/interactions';
import type {
  IProspectContextRepository,
  ProspectContext,
} from '@/modules/outreach/prospects';

const INVALID_FOLLOW_UP_BODY_MESSAGE =
  'Generated body failed validation: it must be plain text, at most 180 words and 5000 characters, with no subject line or code fences.';

type PreparationPhase = 'read' | 'generate' | 'write';
type ProspectConversation = Pick<GenerationContext, 'prospect' | 'history'>;

export class FollowUpPreparationService implements IFollowUpPreparationService {
  private state = initialPreparationState();
  private cancellation = new AbortController();

  constructor(
    private readonly prospects: IProspectContextRepository,
    private readonly interactions: IFollowUpDraftRepository,
    private readonly campaigns: ICampaignRepository,
    private readonly generator: ITextGenerator,
    private readonly steps: readonly FollowUpStep[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  snapshot() {
    return structuredClone(this.state);
  }

  start(limit?: number) {
    if (['running', 'stopping'].includes(this.state.status)) {
      throw new Error('Follow-up preparation is already running.');
    }
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
      throw new Error(
        'Preparation limit must be a positive whole number, or left blank.',
      );
    }
    if (
      !this.steps.length ||
      this.steps.some(
        (step, index) =>
          step.number !== index + 1 ||
          !Number.isFinite(step.waitDays) ||
          step.waitDays < 0 ||
          !step.guidance.trim(),
      )
    ) {
      throw new Error(
        'Follow-up steps must be consecutive, with valid delays and guidance.',
      );
    }

    this.cancellation = new AbortController();
    this.state = {
      ...initialPreparationState(),
      status: 'running',
      limit: limit ?? null,
      startedAt: this.now().toISOString(),
    };
    void this.execute();

    return this.snapshot();
  }

  stop() {
    if (this.state.status === 'running') {
      this.state.status = 'stopping';
      // Cancel generation, but never abort an Airtable create with an unknown outcome.
      this.cancellation.abort();
    }

    return this.snapshot();
  }

  private canContinue() {
    return (
      this.state.status === 'running' &&
      (this.state.limit === null || this.state.drafted < this.state.limit)
    );
  }

  private assertContinuing() {
    this.cancellation.signal.throwIfAborted();
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

      while (this.canContinue()) {
        const page = await this.prospects.pageWithInteractions(offset);
        for (const id of page.ids) {
          if (!this.canContinue()) {
            break;
          }
          if (seenProspects.has(id)) {
            continue;
          }
          seenProspects.add(id);
          await this.prepare(id);
        }
        if (!this.canContinue()) {
          break;
        }
        offset = page.offset;
        if (!offset) {
          break;
        }
        if (seenOffsets.has(offset)) {
          throw new Error('Repeated Airtable page.');
        }
        seenOffsets.add(offset);
      }
      this.state.status = this.cancellation.signal.aborted
        ? 'stopped'
        : 'completed';
    } catch {
      if (this.cancellation.signal.aborted) {
        this.state.status = 'stopped';

        return;
      }
      this.state.status = 'error';
      this.state.error =
        'Preparation stopped because candidate records could not be read. Check Airtable access and field configuration. Drafts already confirmed remain saved.';
    }
  }

  private async prepare(id: string) {
    this.state.checked++;
    let phase: PreparationPhase = 'read';

    try {
      const initialContext = await this.loadContext(id);
      const assessment = this.assessEligibility(initialContext);
      if (!assessment.due) {
        this.skip(assessment.reason);

        return;
      }

      const campaign = await this.loadValidCampaign(initialContext.prospect);
      if (!campaign) {
        this.skip('Missing Campaign name or offer');

        return;
      }

      this.state.eligible++;
      phase = 'generate';
      const message = await this.generateFollowUp({
        ...initialContext,
        campaign,
        due: assessment.due,
      });
      this.assertContinuing();

      phase = 'read';
      // Generation may take time. Read the reciprocal links again to detect new
      // replies, outbound sends or Drafts before the only persistent mutation.
      const currentContext = await this.loadContext(id);
      const recheck = this.assessEligibility(currentContext);
      if (!recheck.due) {
        this.skip(recheck.reason);

        return;
      }
      if (this.contextChanged(initialContext, currentContext)) {
        this.skip('Prospect or conversation changed during generation');

        return;
      }

      phase = 'write';
      await this.persistDraft(id, recheck.due, message);
      this.state.drafted++;
    } catch (cause) {
      this.recordPreparationFailure(id, phase, cause);
    }
  }

  private async loadContext(id: string): Promise<ProspectConversation> {
    const prospect = await this.prospects.findContextById(id);
    this.assertContinuing();
    const history = await this.interactions.findHistoryByIds(
      prospect.interactionIds,
    );
    this.assertContinuing();

    return { prospect, history };
  }

  private assessEligibility({ prospect, history }: ProspectConversation) {
    return assessFollowUp(
      prospect,
      history,
      this.steps,
      Date.parse(this.state.startedAt!),
    );
  }

  private async loadValidCampaign(
    prospect: ProspectContext,
  ): Promise<Campaign | undefined> {
    const campaign = await this.campaigns.findById(prospect.campaignIds[0]!);
    this.assertContinuing();

    if (
      !campaign.name.trim() ||
      !String(campaign.guidance.offer ?? '').trim()
    ) {
      return undefined;
    }

    return campaign;
  }

  private async generateFollowUp(context: GenerationContext) {
    const generated = await this.generator.generate(
      FOLLOW_UP_INSTRUCTIONS,
      followUpContext(context),
      this.cancellation.signal,
    );
    const body = generated.trim();

    if (
      !body ||
      body.length > 5000 ||
      body.split(/\s+/).length > 180 ||
      /^subject:/im.test(body) ||
      body.includes('```')
    ) {
      throw new Error(INVALID_FOLLOW_UP_BODY_MESSAGE);
    }

    return body;
  }

  private contextChanged(
    initial: ProspectConversation,
    current: ProspectConversation,
  ) {
    return (
      JSON.stringify(current.prospect) !== JSON.stringify(initial.prospect) ||
      JSON.stringify(sortedById(current.history)) !==
        JSON.stringify(sortedById(initial.history))
    );
  }

  private async persistDraft(
    prospectId: string,
    due: GenerationContext['due'],
    message: string,
  ) {
    await this.interactions.createFollowUpDraft({
      prospectId,
      subject: due.original.subject,
      message,
      gmailThreadId: due.original.gmailThreadId,
    });
  }

  private recordPreparationFailure(
    prospectId: string,
    phase: PreparationPhase,
    cause: unknown,
  ) {
    if (this.cancellation.signal.aborted && phase !== 'write') {
      this.skip('Preparation stopped before draft creation');

      return;
    }

    const { reason, message } = this.failureDetails(phase, cause);
    this.skip(reason);
    this.state.errorCount++;
    this.state.errors = [
      ...this.state.errors.slice(-19),
      { prospectId, message },
    ];
  }

  private failureDetails(phase: PreparationPhase, cause: unknown) {
    if (phase === 'write') {
      return {
        reason: 'Draft write not confirmed',
        message:
          'Draft creation was not confirmed. Check this Prospect in Airtable before another run; no write was retried.',
      };
    }
    if (phase === 'generate') {
      return {
        reason: 'Generation failed',
        message: this.generationFailureMessage(cause),
      };
    }

    return {
      reason: 'Context unavailable',
      message:
        'Cannot read complete Prospect, Campaign or Interaction context. Check Airtable access, fields and timestamps.',
    };
  }

  private generationFailureMessage(cause: unknown) {
    if (cause instanceof TextGenerationError) {
      return `${cause.message} No Draft created; no automatic retry was made.`;
    }
    if (
      cause instanceof Error &&
      cause.message === INVALID_FOLLOW_UP_BODY_MESSAGE
    ) {
      return `${INVALID_FOLLOW_UP_BODY_MESSAGE} No Draft created; no automatic retry was made.`;
    }

    return 'Generation failed unexpectedly. No Draft created; check server logs.';
  }
}

function sortedById(history: HistoryInteraction[]) {
  return [...history].sort((a, b) => a.id.localeCompare(b.id));
}
