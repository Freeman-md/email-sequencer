import { resolve } from 'node:path';

try {
  process.loadEnvFile('.env.local');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

// The standalone server changes cwd to its build directory.
if (process.env.GMAIL_TOKEN_FILE) {
  process.env.GMAIL_TOKEN_FILE = resolve(process.env.GMAIL_TOKEN_FILE);
}
await import('../.next/standalone/server.js');
