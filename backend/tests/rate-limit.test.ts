import { describe, expect, it } from 'vitest';
import { checkMinDelayGap, reserveHourlySlot } from '../src/queue/rateLimit.js';
import { redis } from '../src/lib/redis.js';

describe('rate limiting', () => {
  it('allows a first send and blocks within the min gap', async () => {
    const senderId = 'sender-gap-test';
    await redis.del(`rl:gap:${senderId}`);

    const first = await checkMinDelayGap(senderId, 2000);
    const second = await checkMinDelayGap(senderId, 2000);

    expect(first).toBe(0);
    expect(second).toBeGreaterThan(0);
  });

  it('honors hourly limits atomically', async () => {
    const senderId = 'sender-hour-test';
    const key = `2026-01-01-00`;
    await redis.del(`rl:hour:${senderId}:${key}`);

    const first = await reserveHourlySlot(senderId, key, 2);
    const second = await reserveHourlySlot(senderId, key, 2);
    const third = await reserveHourlySlot(senderId, key, 2);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(third).toBe(false);
  });
});
