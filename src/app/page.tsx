import { getSequencerServices } from '@/app/server/composition';

import { OutreachDashboard } from './components/OutreachDashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const params = await searchParams;
  let oauthFailureDetail: string | undefined;
  if (params.gmail === 'wrong-account') {
    oauthFailureDetail =
      'Reconnect rejected: Google returned a different account. Your existing mailbox is unchanged. Reconnect and select the intended account.';
  }
  if (params.gmail === 'run-active') {
    oauthFailureDetail =
      'Gmail connection was not changed because a run or another connection change is active. Stop the run, wait for it to finish safely, then reconnect.';
  }
  let initial = null;
  let initialError: string | undefined;

  try {
    initial = await getSequencerServices().sequencer.getDashboardState();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : 'Configuration unavailable.';
  }

  return (
    <OutreachDashboard
      initial={initial}
      initialError={initialError}
      oauthFailed={params.gmail === 'failed'}
      oauthFailureDetail={oauthFailureDetail}
    />
  );
}
