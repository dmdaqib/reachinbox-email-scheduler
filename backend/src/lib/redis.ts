import RedisModule from 'ioredis';
import { env } from '../config/env.js';

const Redis = (RedisModule as any).default || RedisModule;

class MemoryRedis {
  private store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string | number) {
    this.store.set(key, String(value));
    return 'OK';
  }

  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }

  async eval(_script: string, _numKeys: number, ...args: unknown[]) {
    const key = String(args[0] ?? '');
    const values = args.slice(1);

    if (key.includes('rl:gap:')) {
      const now = Number(values[0] ?? Date.now());
      const minDelayMs = Number(values[1] ?? env.MIN_EMAIL_DELAY_MS);
      const last = Number(this.store.get(key) ?? '0');

      if (!this.store.has(key)) {
        this.store.set(key, String(now));
        return 0;
      }

      const elapsed = now - last;
      if (elapsed >= minDelayMs) {
        this.store.set(key, String(now));
        return 0;
      }

      return minDelayMs - elapsed;
    }

    if (key.includes('rl:hour:')) {
      const limit = Number(values[0] ?? env.MAX_EMAILS_PER_HOUR);
      const current = Number(this.store.get(key) ?? '0');

      if (current >= limit) {
        return 0;
      }

      this.store.set(key, String(current + 1));
      return 1;
    }

    return 0;
  }
}

const useMemoryRedis = env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export const redis: any = useMemoryRedis
  ? new MemoryRedis()
  : new Redis(env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

