import 'server-only';
import {
  mkdir,
  readFile,
  rename,
  writeFile,
  unlink,
  lstat,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getConfig } from '@/infrastructure/config/env';

const tokenSchema = z.object({
  refreshToken: z.string().min(1),
  email: z.email(),
});
export type StoredToken = z.infer<typeof tokenSchema>;

export async function readToken(): Promise<StoredToken | null> {
  const path = getConfig().GMAIL_TOKEN_FILE;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0)
      throw new Error('Unsafe token permissions');
    return tokenSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null;
    throw new Error(
      'Gmail token file is unreadable or insecure. Check GMAIL_TOKEN_FILE and set file permissions to 600.',
    );
  }
}

export async function writeToken(token: StoredToken): Promise<void> {
  const path = getConfig().GMAIL_TOKEN_FILE;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(tokenSchema.parse(token)), {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => undefined);
    throw new Error(
      'Cannot save the Gmail connection. Check token directory ownership and write permissions.',
    );
  }
}
