import { request as httpRequest, type IncomingMessage, type ClientRequest } from 'node:http';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
const requests: ClientRequest[] = [];
afterEach(async () => {
  requests.splice(0).forEach((request) => request.destroy());
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(mode: 'none' | 'local' | 'proxy' = 'none') {
  const data = await makeTempDir();
  const app = await buildApp(
    loadConfig({
      DATA_DIR: data,
      LOG_LEVEL: 'silent',
      AUTH_MODE: mode,
      PROXY_TRUSTED_IPS: '127.0.0.1',
      PROXY_AUTH_HEADER: 'x-auth-request-user',
      PROXY_AUTH_USER: 'owner@example.com',
    }),
  );
  apps.push(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, address, content: path.join(data, 'content') };
}

async function connect(address: string, headers: Record<string, string> = {}) {
  let response!: IncomingMessage;
  const frames: string[] = [];
  const request = httpRequest(`${address}/api/v1/events`, { headers });
  requests.push(request);
  await new Promise<void>((resolve, reject) => {
    request.once('error', reject);
    request.once('response', (incoming) => {
      response = incoming;
      let pending = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => {
        pending += chunk;
        const split = pending.split('\n\n');
        pending = split.pop()!;
        frames.push(...split);
      });
      incoming.on('error', () => undefined); // Socket abort is expected on disconnect/shutdown.
      resolve();
    });
    request.end();
  });
  return { request, response, frames };
}

describe('GET /api/v1/events', () => {
  it('streams external watcher batches to multiple clients and shuts down active connections', async () => {
    const { app, address, content } = await setup();
    const first = await connect(address);
    const second = await connect(address);
    expect(first.response.statusCode).toBe(200);
    expect(first.response.headers['content-type']).toContain('text/event-stream');
    expect(first.response.headers['cache-control']).toBe('no-store, no-transform');
    expect(first.response.headers['x-accel-buffering']).toBe('no');
    expect(first.response.headers['x-content-type-options']).toBe('nosniff');
    expect(first.response.headers['content-security-policy']).toContain("connect-src 'self'");
    await mkdir(path.join(content, 'Old'));
    await writeFile(path.join(content, 'Old/Doc.md'), '---\nid: doc-external\n---\n# External');
    await vi.waitFor(() => expect(first.frames.join('\n')).toContain('Old/Doc.md'), {
      timeout: 5000,
    });
    await rename(path.join(content, 'Old'), path.join(content, 'New'));
    await vi.waitFor(
      () => {
        expect(first.frames.join('\n')).toContain('"previousPath":"Old/Doc.md"');
        expect(second.frames.join('\n')).toContain('New/Doc.md');
      },
      { timeout: 5000 },
    );
    const before = first.frames.length;
    const session = (await app.inject('/api/v1/auth/session')).json();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/documents',
          headers: { 'x-leandocs-csrf': session.csrfToken },
          payload: { name: 'App write' },
        })
      ).statusCode,
    ).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(first.frames).toHaveLength(before);
    first.request.destroy();
    await app.close();
    await vi.waitFor(() => expect(second.response.destroyed).toBe(true));
  });

  it('requires local authentication and stops an existing stream before disclosing post-logout changes', async () => {
    const { app, address, content } = await setup('local');
    expect((await app.inject('/api/v1/events')).statusCode).toBe(401);
    const setupStatus = (await app.inject('/api/v1/auth/setup')).json();
    const password = 'an administrator passphrase';
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      headers: { 'x-leandocs-setup-token': setupStatus.setupToken },
      payload: { username: 'Admin', password, confirmPassword: password },
    });
    const anonymous = (await app.inject('/api/v1/auth/session')).json();
    const signed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': anonymous.csrfToken },
      payload: { username: 'Admin', password },
    });
    const cookie = String(signed.headers['set-cookie']).split(';')[0]!;
    const client = await connect(address, { cookie });
    await vi.waitFor(() => expect(client.frames.join('\n')).toContain('event: ready'));
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie, 'x-leandocs-csrf': signed.json().csrfToken },
    });
    await writeFile(path.join(content, 'Private.md'), '# Private');
    await vi.waitFor(() => expect(client.response.complete).toBe(true), { timeout: 5000 });
    expect(client.frames.join('\n')).not.toContain('Private');
    expect((await app.inject({ url: '/api/v1/events', headers: { cookie } })).statusCode).toBe(401);
  });

  it('rejects foreign origins and methods without allocating streams', async () => {
    const { app } = await setup();
    for (const headers of [
      { origin: 'https://foreign.example' },
      { 'sec-fetch-site': 'cross-site' },
    ])
      expect((await app.inject({ url: '/api/v1/events', headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'HEAD', url: '/api/v1/events' })).statusCode).toBe(404);
  });

  it('uses trusted gateway identity in proxy mode', async () => {
    const { app, address } = await setup('proxy');
    expect((await app.inject('/api/v1/events')).statusCode).toBe(401);
    const client = await connect(address, { 'x-auth-request-user': 'owner@example.com' });
    expect(client.response.statusCode).toBe(200);
    await vi.waitFor(() => expect(client.frames.join('\n')).toContain('event: ready'));
  });
});
