import { Dashboard } from '@/features/sequencer';
import { getSequencerServices } from '@/features/sequencer/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const params = await searchParams;
  let initial = null;
  let initialError: string | undefined;

  try {
    initial = await getSequencerServices().sequencer.getDashboardState();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : 'Configuration unavailable.';
  }

  return (
    <Dashboard
      initial={initial}
      initialError={initialError}
      oauthFailed={params.gmail === 'failed'}
    />
  );
}
