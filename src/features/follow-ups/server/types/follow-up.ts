import type { FollowUpStep } from '../../constants/steps';
import type { Campaign } from '@/modules/outreach/campaigns';
import type { HistoryInteraction } from '@/modules/outreach/interactions';
import type { ProspectContext } from '@/modules/outreach/prospects';

export type DueFollowUp = {
  step: FollowUpStep;
  original: HistoryInteraction;
  latest: HistoryInteraction;
};
export type GenerationContext = {
  prospect: ProspectContext;
  campaign: Campaign;
  history: HistoryInteraction[];
  due: DueFollowUp;
};
