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

    // Stale PROCESSING recovery: Any email in PROCESSING for more than 60 seconds is recovered to FAILED
    const staleProcessing = await prisma.email.findMany({
      where: {
        status: 'PROCESSING',
        etherealMessageId: null,
        updatedAt: { lt: new Date(Date.now() - 60 * 1000) },
      },
    });

    for (const email of staleProcessing) {
      if (email.status === 'SENT' || email.etherealMessageId) continue;
      console.log(`[DISPATCH-FAIL] BEFORE FAILED UPDATE email=${email.id}`);
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastError: 'SMTP dispatch timed out or worker became stale after 60 seconds',
        },
      });
      console.log(`[DISPATCH-FAIL] FAILED UPDATE SUCCESS email=${email.id}`);
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
