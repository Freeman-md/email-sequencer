import 'server-only';
import { CampaignRepository } from './campaigns/airtable/campaign.repository';
import { InteractionRepository } from './interactions/airtable/interaction.repository';
import { MailboxRepository } from './mailboxes/airtable/mailbox.repository';
import { ProspectRepository } from './prospects/airtable/prospect.repository';
import { ScheduleRepository } from './schedules/airtable/schedule.repository';

import type { IAirtableClient } from '@/infrastructure/airtable/interfaces/client.interface';

export function composeOutreachRepositories(client: IAirtableClient) {
  return {
    prospects: new ProspectRepository(client),
    interactions: new InteractionRepository(client),
    campaigns: new CampaignRepository(client),
    mailboxes: new MailboxRepository(client),
    schedules: new ScheduleRepository(client),
  };
}
