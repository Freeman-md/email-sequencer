import 'server-only';
import { getInfrastructure } from '@/infrastructure';

import { FOLLOW_UP_STEPS } from '../constants/steps';

import { CampaignsRepository } from './repositories/campaigns.repository';
import { InteractionsRepository } from './repositories/interactions.repository';
import { ProspectsRepository } from './repositories/prospects.repository';
import { FollowUpsService } from './services/follow-ups.service';
import { FollowUpGenerator } from './services/generator';

function composeService() {
  const { airtable, textGenerator } = getInfrastructure();

  return new FollowUpsService(
    new ProspectsRepository(airtable),
    new InteractionsRepository(airtable),
    new CampaignsRepository(airtable),
    new FollowUpGenerator(textGenerator),
    FOLLOW_UP_STEPS,
  );
}
const processState = globalThis as typeof globalThis & {
  emailSequencerFollowUps?: ReturnType<typeof composeService>;
};

export function getFollowUpsService() {
  processState.emailSequencerFollowUps ??= composeService();

  return processState.emailSequencerFollowUps;
}
