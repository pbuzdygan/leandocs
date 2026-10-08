import { PassThrough } from 'node:stream';
import type { ContentChanges, EventsReady } from '@leandocs/shared';
import { AppError } from '../errors.js';
import { hasChanges } from '../documents/registry.js';
import type { ContentSync } from './content-sync.js';

const HEARTBEAT_MS = 15_000;
const MAX_CONNECTION_MS = 5 * 60_000;
const MAX_BUFFER_BYTES = 64 * 1024;
const MAX_CLIENTS = 32;

interface Client {
  stream: PassThrough;
  authorized: () => boolean;
}

/** Ephemeral invalidations only: reconnecting clients refetch instead of replaying a journal. */
export class ChangeEvents {
  private readonly clients = new Set<Client>();
  private readonly unsubscribe: () => void;
  private closed = false;

  constructor(sync: ContentSync) {
    this.unsubscribe = sync.onChange((changes) => this.broadcast(changes));
  }

  connect(authorized: () => boolean): PassThrough {
    if (this.closed || this.clients.size >= MAX_CLIENTS)
      throw new AppError(503, 'EVENTS_UNAVAILABLE', 'Reconnect to receive document changes.');
    const stream = new PassThrough({ highWaterMark: 16 * 1024 });
    const client = { stream, authorized };
    this.clients.add(client);
    const heartbeat = setInterval(() => this.write(client, ': heartbeat\n\n'), HEARTBEAT_MS);
    const expiry = setTimeout(() => stream.destroy(), MAX_CONNECTION_MS);
    heartbeat.unref();
    expiry.unref();
    stream.once('close', () => {
      clearInterval(heartbeat);
      clearTimeout(expiry);
      this.clients.delete(client);
    });
    this.write(
      client,
      `retry: 3000\nevent: ready\ndata: ${JSON.stringify({ resync: true } satisfies EventsReady)}\n\n`,
    );
    return stream;
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
    for (const { stream } of this.clients) stream.destroy();
    this.clients.clear();
  }

  private broadcast(changes: ContentChanges): void {
    if (!hasChanges(changes) || this.clients.size === 0) return;
    const frame = `event: content-changed\ndata: ${JSON.stringify(changes)}\n\n`;
    for (const client of this.clients) this.write(client, frame);
  }

  private write({ stream, authorized }: Client, frame: string): void {
    if (stream.destroyed || stream.writableEnded) return;
    // Revalidate before every event and heartbeat: logout, expiry and MFA rotation stop disclosure.
    try {
      if (!authorized()) {
        stream.end();
        return;
      }
    } catch {
      stream.destroy();
      return;
    }
    if (
      stream.readableLength + stream.writableLength + Buffer.byteLength(frame) >
      MAX_BUFFER_BYTES
    ) {
      // A slow client or large batch reconnects and resyncs; never accumulate an unbounded queue.
      stream.destroy();
      return;
    }
    stream.write(frame);
  }
}
