import { test, expect } from '@playwright/test';
import { initialRunState } from '../../src/features/sequencer/constants/run';
import type { DashboardState } from '../../src/features/sequencer/types';

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
    page.getByRole('heading', { name: 'All systems ready' }),
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
