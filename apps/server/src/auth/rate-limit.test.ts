import { describe, expect, it } from 'vitest';
import { LoginRateLimiter, LoginRateLimitError } from './rate-limit.js';

function fixture() {
  let time = 0;
  const limiter = new LoginRateLimiter(() => time);
  return {
    limiter,
    at: (value: number) => {
      time = value;
    },
  };
}
function denied(limiter: LoginRateLimiter, ip: string, seconds: number) {
  try {
    limiter.consume(ip);
    throw new Error('Expected throttling');
  } catch (error) {
    expect(error).toBeInstanceOf(LoginRateLimitError);
    expect(error).toMatchObject({
      statusCode: 429,
      code: 'LOGIN_RATE_LIMIT',
      retryAfterSeconds: seconds,
      details: { retryAfterSeconds: seconds },
    });
  }
}

describe('rolling login attempt limits', () => {
  it('handles scoped socket IPv6 and bounds unknown peers without throwing parsing errors', () => {
    const { limiter } = fixture();
    for (let n = 0; n < 5; n++) limiter.consume('fe80::1%eth0');
    denied(limiter, 'fe80::1', 60);
    const unknown = fixture().limiter;
    for (let n = 0; n < 5; n++) unknown.consume('');
    denied(unknown, 'not-an-ip', 60);
  });

  it('rejects the sixth attempt and recovers without extending the wait on rejected retries', () => {
    const { limiter, at } = fixture();
    for (let n = 0; n < 5; n++) limiter.consume('192.0.2.10');
    denied(limiter, '192.0.2.10', 60);
    at(45.2);
    denied(limiter, '192.0.2.10', 15);
    at(59.99);
    denied(limiter, '192.0.2.10', 1);
    at(60);
    expect(() => limiter.consume('192.0.2.10')).not.toThrow();
  });
  it('uses a rolling window so crossing a minute boundary does not reset recent attempts', () => {
    const { limiter, at } = fixture();
    for (const time of [0, 10, 20, 30, 59]) {
      at(time);
      limiter.consume('192.0.2.10');
    }
    at(60);
    limiter.consume('192.0.2.10');
    denied(limiter, '192.0.2.10', 10);
    at(70);
    limiter.consume('192.0.2.10');
    denied(limiter, '192.0.2.10', 10);
  });
  it('bounds distributed attempts and peer storage without allocating entries for rejected floods', () => {
    const { limiter, at } = fixture();
    for (let n = 1; n <= 10; n++) limiter.consume(`192.0.2.${n}`);
    for (let n = 11; n < 2000; n++) denied(limiter, `2001:db8::${n.toString(16)}`, 60);
    // Resource bound: rejected requests cannot grow the map or evict active penalties.
    const peers = Reflect.get(limiter, 'peers') as Map<string, number[]>;
    expect(peers.size).toBe(10);
    at(60);
    limiter.consume('2001:db8::ffff');
    expect(peers.size).toBe(1);
  });
  it('shares limits across equivalent IPv6 and IPv4-mapped socket addresses', () => {
    const { limiter } = fixture();
    for (let n = 0; n < 5; n++) limiter.consume('192.0.2.10');
    denied(limiter, '::ffff:192.0.2.10', 60);
    denied(limiter, '::ffff:c000:20a', 60);
    const ipv6 = fixture().limiter;
    for (let n = 0; n < 5; n++) ipv6.consume('2001:db8::a');
    denied(ipv6, '2001:0db8:0000:0000:0000:0000:0000:000a', 60);
  });
});
