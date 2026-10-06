import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(8080);
    expect(config.maxUploadSize).toBe(50 * 1024 * 1024);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
    expect(config.dataDir).toBe(path.resolve('./data'));
    expect(config.webDistDir).toBeUndefined();
    expect(config.assignMissingIds).toBe(true);
    expect(config.authMode).toBe('local');
    expect(config.proxyAuth).toBeUndefined();
    expect(config.watchMode).toBe('native');
  });

  it('parses WATCH_MODE', () => {
    expect(loadConfig({ WATCH_MODE: 'poll' }).watchMode).toBe('poll');
    expect(loadConfig({ WATCH_MODE: 'off' }).watchMode).toBe('off');
    for (const value of ['on', 'Native', 'inotify'])
      expect(() => loadConfig({ WATCH_MODE: value })).toThrow(ConfigError);
  });

  it('reads environment variables', () => {
    const config = loadConfig({ PORT: '9000', DATA_DIR: '/srv/data', LOG_LEVEL: 'debug' });
    expect(config.port).toBe(9000);
    expect(config.dataDir).toBe('/srv/data');
    expect(config.logLevel).toBe('debug');
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(ConfigError);
    expect(() => loadConfig({ ASSIGN_MISSING_IDS: 'maybe' })).toThrow(ConfigError);
  });

  it('validates the upload size limit', () => {
    expect(loadConfig({ MAX_UPLOAD_SIZE: '1024' }).maxUploadSize).toBe(1024);
    for (const value of ['0', '-1', 'abc', '1.5', '1073741825'])
      expect(() => loadConfig({ MAX_UPLOAD_SIZE: value })).toThrow(ConfigError);
  });

  it('parses ASSIGN_MISSING_IDS', () => {
    expect(loadConfig({ ASSIGN_MISSING_IDS: 'false' }).assignMissingIds).toBe(false);
    expect(loadConfig({ ASSIGN_MISSING_IDS: '1' }).assignMissingIds).toBe(true);
  });

  it('requires explicit, bounded proxy configuration and rejects unsupported modes', () => {
    const env = {
      AUTH_MODE: 'proxy',
      PROXY_TRUSTED_IPS: '192.0.2.10, ::1',
      PROXY_AUTH_HEADER: 'X-Auth-Request-User',
      PROXY_AUTH_USER: 'admin@example.com',
    };
    expect(loadConfig(env).proxyAuth).toEqual({
      trustedIps: ['192.0.2.10', '::1'],
      header: 'x-auth-request-user',
      username: 'admin@example.com',
    });
    for (const name of ['PROXY_TRUSTED_IPS', 'PROXY_AUTH_HEADER', 'PROXY_AUTH_USER'])
      expect(() => loadConfig({ ...env, [name]: '' })).toThrow(ConfigError);
    for (const value of [
      '*',
      'localhost',
      '192.0.2.0/24',
      '127.0.0.1,',
      '::1%lo',
      Array(33).fill('127.0.0.1').join(','),
    ])
      expect(() => loadConfig({ ...env, PROXY_TRUSTED_IPS: value })).toThrow(ConfigError);
    for (const value of [
      'Cookie',
      'Host',
      'x-forwarded-for',
      'x-forwarded-user',
      'x-leandocs-csrf',
      'x-user\r\n',
      'x-user\n',
      'x_user',
    ])
      expect(() => loadConfig({ ...env, PROXY_AUTH_HEADER: value })).toThrow(ConfigError);
    for (const value of [' admin', 'a,b', 'a\nb', 'admin\n', 'ą', 'a'.repeat(257)])
      expect(() => loadConfig({ ...env, PROXY_AUTH_USER: value })).toThrow(ConfigError);
    for (const value of ['NONE', 'LOCAL', 'typo'])
      expect(() => loadConfig({ AUTH_MODE: value })).toThrow(ConfigError);
    expect(loadConfig({ AUTH_MODE: 'local', PROXY_TRUSTED_IPS: '*' }).proxyAuth).toBeUndefined();
    expect(loadConfig({ AUTH_MODE: 'none', PROXY_TRUSTED_IPS: '*' })).toMatchObject({
      authMode: 'none',
      proxyAuth: undefined,
    });
  });
  it('validates and canonicalizes PUBLIC_ORIGIN', () => {
    expect(loadConfig({ PUBLIC_ORIGIN: 'https://docs.example.test/' }).publicOrigin).toBe(
      'https://docs.example.test',
    );
    expect(loadConfig({}).publicOrigin).toBeUndefined();
    for (const value of [
      'null',
      '*',
      'ftp://docs.test',
      'https://user:pass@docs.test',
      'https://docs.test/path',
      'https://docs.test/?x=1',
      'https://docs.test/#x',
      'https://docs.test\n',
    ])
      expect(() => loadConfig({ PUBLIC_ORIGIN: value })).toThrow(ConfigError);
  });
});
