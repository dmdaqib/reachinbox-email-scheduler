import { prisma } from '../lib/prisma.js';
import { runDispatcherTick } from './dispatcher.js';

export async function reconcileStaleJobs() {
  // 1. Recover stale PROCESSING emails (older than 30 seconds)
  const staleProcessing = await prisma.email.findMany({
    where: {
      status: 'PROCESSING',
      etherealMessageId: null,
      updatedAt: { lt: new Date(Date.now() - 30 * 1000) },
    },
  });

  for (const email of staleProcessing) {
    if (email.status === 'SENT' || email.etherealMessageId) continue;
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'SCHEDULED',
        lastError: 'Recovered after stale PROCESSING state',
      },
    });
  }

  // 2. Execute dispatcher tick to process all due emails from PostgreSQL
  await runDispatcherTick();

  return { dispatchedCount: 0, reQueuedCount: 0, staleCount: staleProcessing.length };
}

let periodicTimer: NodeJS.Timeout | null = null;

export function startPeriodicReconciliation(intervalMs = 2000) {
  if (periodicTimer) return;
  console.log(`[RECONCILE] Initializing periodic reconciliation ticker (${intervalMs}ms interval)`);
  periodicTimer = setInterval(async () => {
    try {
      await reconcileStaleJobs();
    } catch (err) {
      console.error('[RECONCILE Error] Periodic reconciliation error:', err);
    }
  }, intervalMs);
}
