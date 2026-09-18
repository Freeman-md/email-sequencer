import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    httpCredentials: {
      username: 'operator',
      password: 'local-ui-test-password',
    },
    viewport: { width: 1440, height: 1024 },
  },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3100',
    env: {
      EMAIL_SEQUENCER_SCHEDULER_DISABLED: '1',
      APP_PASSWORD: 'local-ui-test-password',
      PORT: '3100',
      HOSTNAME: '127.0.0.1',
    },
    reuseExistingServer: false,
  },
});
