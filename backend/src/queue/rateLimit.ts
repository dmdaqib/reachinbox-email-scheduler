import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

export async function checkMinDelayGap(senderId: string, minDelayMs: number) {
  const key = `rl:gap:${senderId}`;
  if (env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    const now = Date.now();
    const last = Number((await redis.get(key)) ?? '0');
    if (!last) {
      await redis.set(key, now);
      return 0;
    }

    const elapsed = now - last;
    if (elapsed >= minDelayMs) {
      await redis.set(key, now);
      return 0;
    }

    return minDelayMs - elapsed;
  }

  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local minDelayMs = tonumber(ARGV[2])
    local last = redis.call('GET', key)
    if not last then
      redis.call('SET', key, now)
      return 0
    end
    local elapsed = now - tonumber(last)
    if elapsed >= minDelayMs then
      redis.call('SET', key, now)
      return 0
    end
    return minDelayMs - elapsed
  `;

  const result = await redis.eval(script, 1, key, Date.now(), minDelayMs);
  return Number(result || 0);
}

export async function reserveHourlySlot(senderId: string, hourKey: string, limit: number) {
  const key = `rl:hour:${senderId}:${hourKey}`;
  if (env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    const current = Number((await redis.get(key)) ?? '0');
    if (current >= limit) {
      return false;
    }

    await redis.set(key, current + 1);
    return true;
  }

  const script = `
    local key = KEYS[1]
    local current = tonumber(redis.call('GET', key) or '0')
    if current >= tonumber(ARGV[1]) then
      return 0
    end
    local next = current + 1
    redis.call('SET', key, next, 'EX', 7200)
    return 1
  `;

  const result = await redis.eval(script, 1, key, limit);
  return Number(result || 0) === 1;
}
