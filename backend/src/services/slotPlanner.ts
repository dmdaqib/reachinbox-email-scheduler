export type PlannedWindow = {
  index: number;
  scheduledAt: Date;
};

export function startOfHourUTC(date: Date) {
  const clone = new Date(date);
  clone.setUTCMinutes(0, 0, 0);
  return clone;
}

export function nextHourUTC(date: Date) {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next;
}

export function planScheduledWindows({
  startAt,
  delayMs,
  hourlyLimit,
  total,
}: {
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
  total: number;
}): PlannedWindow[] {
  if (total <= 0) return [];

  const base = new Date(startAt);
  const windows: PlannedWindow[] = [];
  let currentHourStart = startOfHourUTC(base);
  let currentHourCount = 0;

  for (let index = 0; index < total; index += 1) {
    const candidate = new Date(base.getTime() + index * delayMs);
    const candidateHourStart = startOfHourUTC(candidate);

    if (candidateHourStart.getTime() !== currentHourStart.getTime() && currentHourCount >= hourlyLimit) {
      currentHourStart = nextHourUTC(currentHourStart);
      currentHourCount = 0;
    }

    const scheduledAt = new Date(Math.max(candidate.getTime(), currentHourStart.getTime() + currentHourCount * delayMs));
    windows.push({ index, scheduledAt });
    currentHourCount += 1;

    if (currentHourCount >= hourlyLimit) {
      currentHourStart = nextHourUTC(currentHourStart);
      currentHourCount = 0;
    }
  }

  return windows;
}

export function computeMinDelayWait({ nowMs, lastAllowedAtMs, minDelayMs }: { nowMs: number; lastAllowedAtMs: number; minDelayMs: number }) {
  const elapsed = nowMs - lastAllowedAtMs;
  if (elapsed >= minDelayMs) return 0;
  return minDelayMs - elapsed;
}

export function computeNextHourlyWindow({ scheduledAt, delayMs }: { scheduledAt: Date; delayMs: number }) {
  const hourStart = startOfHourUTC(scheduledAt);
  const nextWindow = nextHourUTC(hourStart);
  return new Date(nextWindow.getTime() + Math.max(0, delayMs));
}
