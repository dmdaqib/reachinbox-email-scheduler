import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';

describe('environment config', () => {
  it('exposes the required scheduling defaults', () => {
    expect(env.MIN_EMAIL_DELAY_MS).toBeGreaterThanOrEqual(0);
    expect(env.MAX_EMAILS_PER_HOUR).toBeGreaterThan(0);
    expect(env.WORKER_CONCURRENCY).toBeGreaterThan(0);
  });
});
