'use client';

import { FollowUps } from '@/features/follow-ups';
import { MailboxManagement } from '@/features/mailboxes';
import { Schedules } from '@/features/schedules';
import { SequencerPanel } from '@/features/sequencer';

import type { ComponentProps } from 'react';

export function OutreachDashboard(
  props: Omit<
    ComponentProps<typeof SequencerPanel>,
    'children' | 'renderMailboxes' | 'renderSchedules'
  >,
) {
  return (
    <SequencerPanel
      {...props}
      renderSchedules={(active) => <Schedules active={active} />}
      renderMailboxes={(active) => (
        <MailboxManagement
          active={active}
          authorizationError={props.oauthFailureDetail}
        />
      )}
    >
      <FollowUps />
    </SequencerPanel>
  );
}
