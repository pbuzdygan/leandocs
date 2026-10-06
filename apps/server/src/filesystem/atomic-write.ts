import { randomBytes } from 'node:crypto';
import { link, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Atomic write (PROJECT_SPEC §29): temp file in the same directory → fsync → rename.
 * Readers see either the old or the new content, never a partial file.
 */
export async function atomicWriteFile(target: string, data: string | Uint8Array): Promise<void> {
  const temp = await writeTempFile(target, data);
  try {
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/**
 * Like atomicWriteFile but fails with EEXIST instead of replacing an existing file.
 * Uses link() so the existence check and the publish are one atomic step.
 */
export async function atomicCreateFile(target: string, data: string | Uint8Array): Promise<void> {
  const temp = await writeTempFile(target, data);
  try {
    await link(temp, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    // Filesystems without hard links: exclusive create, then write.
    await unlink(temp).catch(() => undefined);
    const handle = await open(target, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return;
  }
  await unlink(temp).catch(() => undefined);
}

async function writeTempFile(target: string, data: string | Uint8Array): Promise<string> {
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  const handle = await open(temp, 'wx');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  await handle.close();
  return temp;
}
