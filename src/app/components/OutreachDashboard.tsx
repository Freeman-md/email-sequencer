import { FollowUps } from '@/features/follow-ups';
import { SequencerPanel } from '@/features/sequencer';

import type { ComponentProps } from 'react';

export function OutreachDashboard(
  props: Omit<ComponentProps<typeof SequencerPanel>, 'children'>,
) {
  return (
    <SequencerPanel {...props}>
      <FollowUps />
    </SequencerPanel>
  );
}
