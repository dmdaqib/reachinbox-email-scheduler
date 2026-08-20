import { describe, expect, it } from 'vitest';
import { computeMinDelayWait, nextHourUTC, planScheduledWindows } from '../src/services/slotPlanner.js';

describe('scheduler planner', () => {
  it('enforces hour caps and preserves ordering', () => {
    const windows = planScheduledWindows({
      startAt: new Date('2026-01-01T00:00:00Z'),
      delayMs: 2000,
      hourlyLimit: 2,
      total: 5,
    });

    expect(windows.length).toBe(5);
    expect(windows[0].scheduledAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(windows[1].scheduledAt.toISOString()).toBe('2026-01-01T00:00:02.000Z');
    expect(windows[2].scheduledAt.toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });

  it('computes min delay waits correctly', () => {
    expect(computeMinDelayWait({ nowMs: 5000, lastAllowedAtMs: 4000, minDelayMs: 2000 })).toBe(1000);
    expect(computeMinDelayWait({ nowMs: 4000, lastAllowedAtMs: 3000, minDelayMs: 2000 })).toBe(1000);
    expect(computeMinDelayWait({ nowMs: 3500, lastAllowedAtMs: 3000, minDelayMs: 2000 })).toBe(1500);
  });

  it('moves to the next UTC hour window', () => {
    const slot = nextHourUTC(new Date('2026-01-01T00:30:00Z'));
    expect(slot.toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });
});
