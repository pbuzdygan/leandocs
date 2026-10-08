import { BlockList, isIP } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { SessionResponse } from '@leandocs/shared';
import type { AppConfig } from '../config/config.js';

/** Trust only the immediate socket peer; forwarded IP/identity chains are never authority. */
export class ProxyAuthService {
  private readonly peers = new BlockList();
  private readonly csrfToken = randomBytes(32).toString('hex');

  constructor(private readonly config: NonNullable<AppConfig['proxyAuth']>) {
    for (const ip of config.trustedIps) this.peers.addAddress(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  }

  session(request: FastifyRequest): SessionResponse {
    const peer = request.raw.socket.remoteAddress ?? '';
    const family = isIP(peer);
    let count = 0;
    for (let i = 0; i < request.raw.rawHeaders.length; i += 2)
      if (request.raw.rawHeaders[i]!.toLowerCase() === this.config.header) count++;
    const value = request.headers[this.config.header];
    const trusted = family !== 0 && this.peers.check(peer, family === 4 ? 'ipv4' : 'ipv6');
    const authenticated = trusted && count === 1 && value === this.config.username;
    return {
      authMode: 'proxy',
      user: authenticated ? { username: this.config.username } : null,
      csrfToken: authenticated ? this.csrfToken : '',
    };
  }
}
