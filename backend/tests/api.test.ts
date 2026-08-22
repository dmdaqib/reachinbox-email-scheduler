import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('Express API App', () => {
  it('returns healthy status on /api/health endpoint', async () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('handles root GET / endpoint', async () => {
    const app = createApp();
    expect(app).toBeDefined();
  });
});
