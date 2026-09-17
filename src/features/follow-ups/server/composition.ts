import 'server-only';

import { getInfrastructure } from '@/infrastructure';
import { composeOutreachRepositories } from '@/modules/outreach/server';

import { FOLLOW_UP_STEPS } from '../constants/steps';

import { FollowUpPreparationService } from './services/follow-up-preparation.service';
import { FollowUpGenerator } from './services/generator';

function composeService() {
  const { airtable, textGenerator } = getInfrastructure();

  const { prospects, interactions, campaigns } =
    composeOutreachRepositories(airtable);

  return new FollowUpPreparationService(
    prospects,
    interactions,
    campaigns,
    new FollowUpGenerator(textGenerator),
    FOLLOW_UP_STEPS,
  );
}
const processState = globalThis as typeof globalThis & {
  emailSequencerFollowUps?: ReturnType<typeof composeService>;
};

export function getFollowUpPreparationService() {
  const existing = processState.emailSequencerFollowUps;
  if (existing && typeof existing.stop !== 'function') {
    // Development reloads retain global instances, including their old methods.
    // Replacing an active instance would orphan its work and release its lock.
    if (['running', 'stopping'].includes(existing.snapshot().status)) {
      throw new Error(
        'This preparation is running an older server version without Stop support. Restart the development server once to load the new controls; refreshing the browser is not enough. Check the latest Airtable draft if a save is interrupted.',
      );
    }
    processState.emailSequencerFollowUps = composeService();
  }
  processState.emailSequencerFollowUps ??= composeService();

  return processState.emailSequencerFollowUps;
}
