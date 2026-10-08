import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentRegistry } from '../documents/registry.js';
import { MutationLock } from '../filesystem/lock.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { ContentSync } from './content-sync.js';
import { ChangeEvents } from './change-events.js';

const hubs: ChangeEvents[] = [];
afterEach(() => {
  hubs.splice(0).forEach((hub) => hub.close());
  vi.useRealTimers();
});
async function setup() {
  const root = await makeTempDir();
  const registry = new DocumentRegistry(root, { assignMissingIds: false, logger: silentLogger });
  const sync = new ContentSync(registry, new MutationLock(), silentLogger);
  const hub = new ChangeEvents(sync);
  hubs.push(hub);
  return { root, sync, hub };
}

describe('change event streams', () => {
  it('sends reconnect guidance and safely encodes filenames with newlines', async () => {
    const { root, sync, hub } = await setup();
    const stream = hub.connect(() => true);
    let received = '';
    stream.on('data', (chunk) => (received += String(chunk)));
    await writeFile(path.join(root, 'A\nevent: injected.md'), '# Doc');
    await sync.refresh();
    expect(received).toContain('retry: 3000\nevent: ready\ndata: {"resync":true}\n\n');
    expect(received).toContain('event: content-changed\ndata: ');
    const data = received.split('event: content-changed\ndata: ')[1]!;
    expect(JSON.parse(data.trim()).documents[0].path).toBe('A\nevent: injected.md');
    expect(received).not.toContain('\nevent: injected');
  });

  it('closes revoked sessions on heartbeat and never sends later document changes', async () => {
    vi.useFakeTimers();
    const { root, sync, hub } = await setup();
    let authorized = true;
    const stream = hub.connect(() => authorized);
    let received = '';
    stream.on('data', (chunk) => (received += String(chunk)));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(received).toContain(': heartbeat\n\n');
    authorized = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(stream.writableEnded).toBe(true);
    await writeFile(path.join(root, 'Secret.md'), '# Private');
    await sync.refresh();
    expect(received).not.toContain('Secret');
  });

  it('checks authorization before broadcasting even between heartbeats', async () => {
    const { root, sync, hub } = await setup();
    let authorized = true;
    const stream = hub.connect(() => authorized);
    let received = '';
    stream.on('data', (chunk) => (received += String(chunk)));
    authorized = false;
    await writeFile(path.join(root, 'Secret.md'), '# Private');
    await sync.refresh();
    expect(stream.writableEnded).toBe(true);
    expect(received).not.toContain('content-changed');
  });

  it('disconnects slow clients instead of growing their buffers without a limit', async () => {
    const { root, sync, hub } = await setup();
    const stream = hub.connect(() => true); // Deliberately never consume the readable side.
    for (let index = 0; index < 600 && !stream.destroyed; index++) {
      await writeFile(path.join(root, 'A.md'), `# ${index}`);
      await sync.refresh(['A.md']);
    }
    expect(stream.destroyed).toBe(true);
  });

  it('caps connections, releases disconnected slots and periodically requires reconnection', async () => {
    vi.useFakeTimers();
    const { hub } = await setup();
    const streams = Array.from({ length: 32 }, () => hub.connect(() => true));
    expect(() => hub.connect(() => true)).toThrow('Reconnect');
    streams[0]!.destroy();
    await vi.advanceTimersByTimeAsync(0);
    const replacement = hub.connect(() => true);
    replacement.resume();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(replacement.destroyed).toBe(true);
  });

  it('cleans up streams and timers at shutdown', async () => {
    vi.useFakeTimers();
    const { hub } = await setup();
    const stream = hub.connect(() => true);
    expect(vi.getTimerCount()).toBe(2);
    hub.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(stream.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => hub.connect(() => true)).toThrow('Reconnect');
  });
});
