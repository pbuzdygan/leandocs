import { isIP } from 'node:net';
import { AppError } from '../errors.js';

const WINDOW_SECONDS = 60;
const PEER_ATTEMPTS = 5;
const TOTAL_ATTEMPTS = 10;

export class LoginRateLimitError extends AppError {
  constructor(
    readonly retryAfterSeconds: number,
    busy = false,
  ) {
    super(
      429,
      busy ? 'LOGIN_BUSY' : 'LOGIN_RATE_LIMIT',
      busy
        ? 'Sign-in is busy. Try again in a second.'
        : `Too many sign-in attempts. Try again in ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds },
    );
  }
}

/** Canonical socket addresses only; forwarded headers never supply limiter keys. */
function peerKey(ip: string): string {
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return 'unknown';
  const normalized = new URL(`http://[${ip.split('%')[0]}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const upper = Number.parseInt(mapped[1]!, 16);
  const lower = Number.parseInt(mapped[2]!, 16);
  return [upper >> 8, upper & 255, lower >> 8, lower & 255].join('.');
}

/** Rolling attempt limits for the singleton account, including unknown usernames and successes. */
export class LoginRateLimiter {
  private total: number[] = [];
  private readonly peers = new Map<string, number[]>();

  constructor(private readonly now = () => performance.now() / 1000) {}

  consume(ip: string): void {
    const now = this.now();
    const cutoff = now - WINDOW_SECONDS;
    this.total = this.total.filter((time) => time > cutoff);
    for (const [key, times] of this.peers) {
      const active = times.filter((time) => time > cutoff);
      if (active.length) this.peers.set(key, active);
      else this.peers.delete(key);
    }
    const key = peerKey(ip);
    const times = this.peers.get(key) ?? [];
    const waits: number[] = [];
    if (times.length >= PEER_ATTEMPTS) waits.push(times[0]! + WINDOW_SECONDS - now);
    if (this.total.length >= TOTAL_ATTEMPTS) waits.push(this.total[0]! + WINDOW_SECONDS - now);
    if (waits.length) throw new LoginRateLimitError(Math.max(1, Math.ceil(Math.max(...waits))));
    // Only admitted attempts allocate state: <=10 active peers and <=10 total timestamps.
    this.total.push(now);
    this.peers.set(key, [...times, now]);
  }
}
