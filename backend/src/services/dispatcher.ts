import { prisma } from '../lib/prisma.js';
import { processEmailDispatch } from './email.service.js';

let dispatchRunning = false;

export async function runDispatcherTick() {
  if (dispatchRunning) {
    return;
  }

  dispatchRunning = true;
  const timestamp = new Date().toISOString();

  try {
    console.log(`[DISPATCHER] TICK ${timestamp}`);
    console.log('[DISPATCHER] querying due emails');

    // Recover stale PROCESSING emails (older than 30s) where etherealMessageId IS NULL to SCHEDULED so transient SMTP failures can be retried
    const staleProcessing = await prisma.email.findMany({
      where: {
        status: 'PROCESSING',
        etherealMessageId: null,
        updatedAt: { lt: new Date(Date.now() - 30 * 1000) },
      },
    });

    for (const email of staleProcessing) {
      if (email.etherealMessageId) continue;
      const nextAttempt = (email.attemptCount ?? 0) + 1;
      const maxAttempts = 3;

      if (nextAttempt >= maxAttempts) {
        console.log(`[DISPATCH-FAIL] BEFORE FAILED UPDATE email=${email.id}`);
        await prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            attemptCount: nextAttempt,
            lastError: `Failed after ${maxAttempts} stale processing attempts`,
          },
        });
        console.log(`[DISPATCH-FAIL] FAILED UPDATE SUCCESS email=${email.id}`);
      } else {
        console.log(`[DISPATCH-RECOVERY] Recovering stale PROCESSING email=${email.id} -> SCHEDULED (Attempt ${nextAttempt}/${maxAttempts})`);
        await prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'SCHEDULED',
            attemptCount: nextAttempt,
            lastError: `Recovered after stale PROCESSING state (Attempt ${nextAttempt}/${maxAttempts})`,
          },
        });
      }
    }

    const now = new Date();
    // Query PostgreSQL for due SCHEDULED emails where scheduledAt <= NOW
    const dueEmails = await prisma.email.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
        etherealMessageId: null,
      },
      take: 50,
      orderBy: { scheduledAt: 'asc' },
    });

    console.log(`[DISPATCHER] found ${dueEmails.length} due emails`);

    for (const email of dueEmails) {
      console.log(`[DISPATCHER] dispatching email=${email.id}`);
      await processEmailDispatch(email.id);
    }
  } catch (err) {
    console.error('[DISPATCHER Error] Error in dispatcher tick:', err);
  } finally {
    dispatchRunning = false;
  }
}

let dispatcherTimer: NodeJS.Timeout | null = null;

export function startDispatcher(intervalMs = 2000) {
  if (dispatcherTimer) return;
  console.log('[DISPATCHER] started');
  runDispatcherTick().catch((err) => console.error('[DISPATCHER Error]', err));
  dispatcherTimer = setInterval(() => {
    runDispatcherTick().catch((err) => console.error('[DISPATCHER Error]', err));
  }, intervalMs);
}
