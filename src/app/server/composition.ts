import 'server-only';

import { MailboxesService } from '@/features/mailboxes/server/service';
import { SchedulesService } from '@/features/schedules/server/service';
import { SendingScheduler } from './scheduler';
import { SequencerRuntime } from '@/features/sequencer/server/runtime/sequencer-runtime';
import { ConnectionsService } from '@/features/sequencer/server/services/connections.service';
import { SequencerService } from '@/features/sequencer/server/services/sequencer.service';
import { DailyQueue } from '@/features/sequencer/server/services/daily-queue';
import { MailboxPacing } from '@/features/sequencer/server/services/mailbox-pacing';
import { getInfrastructure } from '@/infrastructure';
import { composeOutreachRepositories } from '@/modules/outreach/server';

function composeServices() {
  const {
    airtable,
    gmail,
    gmailClient,
    mailboxTokens,
    authorization,
    attempts,
    progress,
  } = getInfrastructure();
  const runtime = new SequencerRuntime();
  const {
    interactions,
    prospects,
    mailboxes: repository,
    schedules: scheduleRepository,
  } = composeOutreachRepositories(airtable);
  const schedules = new SchedulesService(scheduleRepository, runtime);
  const mailboxes = new MailboxesService(
    repository,
    mailboxTokens,
    authorization,
    gmail,
    gmailClient,
    runtime,
  );
  const connections = new ConnectionsService(
    interactions,
    prospects,
    mailboxes,
  );
  const pacing = new MailboxPacing(attempts, progress);
  const queue = new DailyQueue(
    interactions,
    prospects,
    mailboxes,
    pacing,
    progress,
  );
  const sequencer = new SequencerService(
    interactions,
    gmail,
    connections,
    runtime,
    attempts,
    schedules,
    progress,
    queue,
  );
  const scheduler = new SendingScheduler(schedules, sequencer, (error) =>
    schedules.setSchedulerError(error),
  );
  schedules.setChangeListener(() => {
    void scheduler.evaluate();
  });

  return { sequencer, connections, mailboxes, schedules, scheduler };
}

const processState = globalThis as typeof globalThis & {
  emailSequencerServices?: ReturnType<typeof composeServices>;
};

export function getSequencerServices() {
  processState.emailSequencerServices ??= composeServices();

  return processState.emailSequencerServices;
}
