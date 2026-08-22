import { prisma } from '../lib/prisma.js';
import { processEmailDispatch } from './email.service.js';

let dispatchRunning = false;

export async function runDispatcherTick() {
  if (dispatchRunning) return;
  dispatchRunning = true;

  try {
    // Recover stale PROCESSING emails (older than 30s) back to SCHEDULED
    await prisma.email.updateMany({
      where: {
        status: 'PROCESSING',
        etherealMessageId: null,
        updatedAt: { lt: new Date(Date.now() - 30 * 1000) },
      },
      data: {
        status: 'SCHEDULED',
        lastError: 'Recovered after stale PROCESSING state',
      },
    });

    const nowWithGrace = new Date(Date.now() + 2000);
    const dueEmails = await prisma.email.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: nowWithGrace },
        etherealMessageId: null,
      },
      take: 50,
      orderBy: { scheduledAt: 'asc' },
    });

    if (dueEmails.length > 0) {
      console.log(`[DISPATCHER] Found ${dueEmails.length} due scheduled emails in PostgreSQL`);
    }

    for (const email of dueEmails) {
      await processEmailDispatch(email.id);
    }
  } catch (err) {
    console.error('[DISPATCHER Error]', err);
  } finally {
    dispatchRunning = false;
  }
}

let dispatcherTimer: NodeJS.Timeout | null = null;

export function startDispatcher(intervalMs = 2000) {
  if (dispatcherTimer) return;
  console.log('[DISPATCHER] Started 2s PostgreSQL email dispatch loop');
  runDispatcherTick().catch((err) => console.error('[DISPATCHER Error]', err));
  dispatcherTimer = setInterval(() => {
    runDispatcherTick().catch((err) => console.error('[DISPATCHER Error]', err));
  }, intervalMs);
}
