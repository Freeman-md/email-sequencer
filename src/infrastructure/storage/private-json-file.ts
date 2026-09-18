import 'server-only';

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readPrivateJson(path: string): Promise<unknown | null> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
      throw new Error('Unsafe file');
    }

    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw new Error(
      'Private storage is unreadable or insecure. Check ownership and file permissions (600).',
    );
  }
}

export async function writePrivateJson(
  path: string,
  value: unknown,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const file = await open(temporary, 'wx', 0o600);

    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');

    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    await unlink(temporary).catch(() => undefined);
    throw new Error(
      'Cannot durably save private storage. Check persistent directory ownership and write permissions.',
    );
  }
}
