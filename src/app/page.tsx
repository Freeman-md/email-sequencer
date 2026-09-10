import { Dashboard } from '@/features/sequencer';
import { getDashboardState } from '@/features/sequencer/server';

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
    initial = await getDashboardState();
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
