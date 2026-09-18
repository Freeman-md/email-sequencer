import { test, expect } from '@playwright/test';
import { initialPreparationState } from '../../src/features/follow-ups/types/preparation';
import { initialRunState } from '../../src/features/sequencer/constants/run';
import type { DashboardState } from '../../src/features/sequencer/types';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/follow-ups/**', (route) =>
    route.fulfill({ json: initialPreparationState() }),
  );
});

const current = {
  id: 'recTest',
  prospect: 'Maya Chen',
  company: 'Northstar Labs',
  email: 'maya@northstarlabs.co',
  subject: 'A clearer onboarding handoff',
  createdAt: '2026-09-09T07:42:00.000Z',
};
const lastSent = {
  id: 'recPrevious',
  prospect: 'Jordan Lee',
  company: 'Rivermere Consulting',
  email: 'jordan@rivermere.co',
  subject: 'Reducing client handover friction',
  createdAt: '2026-09-09T07:00:00Z',
  sentAt: '2026-09-09T12:10:00Z',
};
function fixture(): DashboardState {
  return {
    airtable: { connected: true, detail: 'Connected' },
    gmail: { connected: true, detail: 'maya.ops@gmail.com' },
    serverNow: '2026-09-09T12:10:42.000Z',
    run: { ...initialRunState(), lastSent },
  };
}

test('desktop states, controls and mobile preserve operational fields without overflow', async ({
  page,
}) => {
  let state = fixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/sequencer/**', async (route) => {
    if (route.request().method() !== 'GET') {
      expect(route.request().url()).toContain('/start');
      expect(route.request().postDataJSON()).toEqual({ intervalSeconds: 300 });
      state.run = {
        ...state.run,
        status: 'running',
        phase: 'sending',
        runStartedAt: '2026-09-09T12:00:00Z',
        current,
        sentCount: 3,
      };
      await route.fulfill({ json: state.run, status: 202 });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Ready when you are' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'output/playwright/ready.png',
    fullPage: true,
  });
  await page.getByLabel('INTERVAL SECONDS', { exact: true }).fill('0');
  await expect(page.getByRole('button', { name: 'Start Run' })).toBeDisabled();
  await page.getByLabel('INTERVAL SECONDS', { exact: true }).fill('300');
  await page.getByRole('button', { name: 'Start Run' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sending email' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('INTERVAL SECONDS', { exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: 'output/playwright/sending.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({
    path: 'output/playwright/mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByText('Run started at', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop Run' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1024 });
  state.run.phase = 'waiting';
  state.run.nextSendAt = '2026-09-09T12:15:00.000Z';
  await expect(
    page.getByRole('heading', { name: /Next send in/ }),
  ).toBeVisible();
  await page.screenshot({
    path: 'output/playwright/waiting.png',
    fullPage: true,
  });
  state.run = {
    ...state.run,
    status: 'error',
    phase: 'stopped',
    errors: [
      {
        kind: 'uncertain',
        message:
          'Gmail did not confirm the outcome. Check Gmail before another run.',
        interactionId: current.id,
      },
    ],
  };
  await expect(
    page.getByRole('heading', { name: 'Run stopped', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start New Run' }),
  ).toBeDisabled();
  await page.screenshot({
    path: 'output/playwright/error.png',
    fullPage: true,
  });
  state.run = {
    ...state.run,
    status: 'completed',
    phase: 'idle',
    current: null,
    errors: [],
    sentCount: 5,
    finishedAt: '2026-09-09T12:27:00Z',
  };
  await expect(
    page.getByRole('heading', { name: 'Run complete', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'output/playwright/completed.png',
    fullPage: true,
  });
  state = fixture();
  state.gmail = { connected: false, detail: 'Connect once via OAuth' };
  await expect(page.getByRole('link', { name: 'Connect Gmail' })).toBeVisible();
  await page.screenshot({
    path: 'output/playwright/disconnected.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('mailbox navigation preserves the live run and locks connection changes', async ({
  page,
}) => {
  const state = fixture();
  state.run = {
    ...state.run,
    status: 'running',
    phase: 'waiting',
    runStartedAt: '2026-09-09T12:00:00Z',
    nextSendAt: '2026-09-09T12:15:00Z',
    sentCount: 3,
  };
  await page.route('**/api/sequencer/**', (route) =>
    route.fulfill({ json: state }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Mailboxes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mailboxes', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('maya.ops@gmail.com', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reconnect Gmail' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Stop the active run before changing the Gmail connection.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(
    page.getByRole('heading', { name: /Next send in/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop Run' })).toBeEnabled();
});

for (const staleOutcome of ['success', 'failure'] as const) {
  test(`ignores a stale polling ${staleOutcome} after Start and keeps Stop available`, async ({
    page,
  }) => {
    let state = fixture();
    let polls = 0;
    let release!: () => Promise<void>;
    let received!: () => void;
    const held = new Promise<void>((resolve) => {
      received = resolve;
    });

    await page.route('**/api/sequencer/**', async (route) => {
      if (route.request().method() === 'GET') {
        polls++;
        if (polls > 2) return;
        if (polls === 2) {
          release = async () => {
            await route.fulfill(
              staleOutcome === 'success'
                ? { json: fixture() }
                : { json: { error: 'Stale poll failed' }, status: 503 },
            );
          };
          received();
          return;
        }
        await route.fulfill({ json: state });
        return;
      }

      if (route.request().url().endsWith('/start')) {
        state = {
          ...state,
          run: {
            ...state.run,
            status: 'running',
            phase: 'sending',
            runStartedAt: '2026-09-09T12:00:00Z',
          },
        };
      } else {
        state = { ...state, run: { ...state.run, phase: 'stopping' } };
      }
      await route.fulfill({ json: state.run, status: 202 });
    });

    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Start Run', exact: true }),
    ).toBeEnabled();
    await held;
    await page.getByRole('button', { name: 'Start Run', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Stop Run', exact: true }),
    ).toBeEnabled();
    const staleResponse = page.waitForResponse((response) =>
      response.url().endsWith('/state'),
    );
    await release();
    await staleResponse;
    // Keep later polls pending so they cannot hide a stale update.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(
      page.getByText('Stale poll failed', { exact: false }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Stop Run', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Stop Run', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Stopping…', exact: true }),
    ).toBeDisabled();
  });
}

test('review acknowledgement does not carry over to a later failed run', async ({
  page,
}) => {
  const state = fixture();
  state.run = {
    ...state.run,
    status: 'error',
    phase: 'stopped',
    runStartedAt: '2026-09-09T12:00:00Z',
    errors: [
      {
        kind: 'uncertain',
        interactionId: current.id,
        message: 'Check Gmail before another run.',
      },
    ],
  };
  await page.route('**/api/sequencer/**', (route) =>
    route.fulfill({ json: state }),
  );
  await page.goto('/');
  const checkbox = page.getByRole('checkbox');
  const start = page.getByRole('button', {
    name: 'Start New Run',
    exact: true,
  });
  await expect(start).toBeDisabled();
  await checkbox.check();
  await expect(start).toBeEnabled();

  // A run started elsewhere must require its own acknowledgement even for the same record.
  state.run = { ...state.run, runStartedAt: '2026-09-09T13:00:00Z' };
  await expect(checkbox).not.toBeChecked();
  await expect(start).toBeDisabled();
});

test('prepares drafts, protects command results from stale polling and displays skip reasons on mobile', async ({
  page,
}) => {
  let state = initialPreparationState();
  let polls = 0;
  let release!: () => Promise<void>;
  let held!: () => void;
  const pending = new Promise<void>((resolve) => {
    held = resolve;
  });
  let mutations = 0;
  await page.route('**/api/sequencer/**', (route) =>
    route.fulfill({ json: fixture() }),
  );
  await page.route('**/api/follow-ups/**', async (route) => {
    if (route.request().method() === 'POST') {
      mutations++;
      expect(route.request().url()).toContain('/prepare');
      expect(route.request().postDataJSON()).toEqual({ limit: 1 });
      state = {
        ...state,
        status: 'running',
        limit: 1,
        startedAt: '2026-09-12T12:00:00Z',
      };
      await route.fulfill({ json: state, status: 202 });
    } else {
      polls++;
      if (polls === 2) {
        release = () => route.fulfill({ json: initialPreparationState() });
        held();
      } else await route.fulfill({ json: state });
    }
  });
  await page.goto('/');
  await pending;
  await page.getByLabel('Draft limit (optional)').fill('0');
  await expect(
    page.getByRole('button', { name: 'Prepare Follow-Ups' }),
  ).toBeDisabled();
  await page.getByLabel('Draft limit (optional)').fill('1');
  await page.getByRole('button', { name: 'Prepare Follow-Ups' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop Preparation' }),
  ).toBeEnabled();
  await release();
  await expect(
    page.getByRole('button', { name: 'Stop Preparation' }),
  ).toBeEnabled();
  state = {
    ...state,
    status: 'completed',
    checked: 3,
    eligible: 1,
    drafted: 1,
    skipped: 2,
    reasons: { 'Reply already received': 1, 'Missing Gmail Thread ID': 1 },
  };
  await expect(
    page.getByText(/Preparation complete · Checked: 3/),
  ).toBeVisible();
  await page.getByText('Skip reasons', { exact: true }).click();
  await expect(page.getByText('Missing Gmail Thread ID: 1')).toBeVisible();
  expect(mutations).toBe(1);
  await expect(page.getByText(/Draft limit reached/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  await page
    .getByRole('heading', { name: 'Follow-Ups', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'output/playwright/follow-ups-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('refresh retains the preparation limit and Stop, and stale polls cannot undo stopping', async ({
  page,
}) => {
  let state = {
    ...initialPreparationState(),
    status: 'running' as 'running' | 'stopping' | 'stopped',
    limit: 5,
    checked: 2,
    drafted: 1,
    startedAt: '2026-09-12T12:00:00Z',
  };
  let hold = false;
  let release!: () => Promise<void>;
  let received!: () => void;
  const pending = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route('**/api/sequencer/**', (route) =>
    route.fulfill({ json: fixture() }),
  );
  await page.route('**/api/follow-ups/**', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().url()).toContain('/stop');
      state = { ...state, status: 'stopping' };
      await route.fulfill({ json: state, status: 202 });
    } else if (hold) {
      hold = false;
      const old = { ...state };
      release = () => route.fulfill({ json: old });
      received();
    } else await route.fulfill({ json: state });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Stop Preparation' }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Stop Preparation' }),
  ).toBeEnabled();
  await expect(page.getByLabel('Draft limit (optional)')).toHaveValue('5');
  await expect(page.getByLabel('Draft limit (optional)')).toBeDisabled();
  hold = true;
  await pending;
  await page.getByRole('button', { name: 'Stop Preparation' }).click();
  await expect(page.getByRole('button', { name: 'Stopping…' })).toBeDisabled();
  await release();
  await expect(page.getByRole('button', { name: 'Stopping…' })).toBeDisabled();
  state = { ...state, status: 'stopped' };
  await expect(
    page.getByText(/Preparation stopped · Checked: 2/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Prepare Follow-Ups' }),
  ).toBeEnabled();
});
