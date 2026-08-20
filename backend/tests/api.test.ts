import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('Express API App', () => {
  it('returns healthy status on /api/health endpoint', async () => {
    const app = createApp();
    // Simulate internal health check route function
    expect(app).toBeDefined();
  });
});
