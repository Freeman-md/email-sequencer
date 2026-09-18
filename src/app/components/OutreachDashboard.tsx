'use client';

import { FollowUps } from '@/features/follow-ups';
import { MailboxManagement } from '@/features/mailboxes';
import { SequencerPanel } from '@/features/sequencer';

import type { ComponentProps } from 'react';

export function OutreachDashboard(
  props: Omit<
    ComponentProps<typeof SequencerPanel>,
    'children' | 'renderMailboxes'
  >,
) {
  return (
    <SequencerPanel
      {...props}
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
