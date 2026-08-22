import { prisma } from '../lib/prisma.js';
import { processEmailDispatch } from './email.service.js';

export async function runDispatcherTick() {
  const now = new Date();

  // Recover stale PROCESSING emails (older than 30 seconds) so no email stays stuck in PROCESSING
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

  if (dueEmails.length > 0) {
    console.log(`[DISPATCHER] found ${dueEmails.length} due emails`);
  }

  for (const email of dueEmails) {
    await processEmailDispatch(email.id);
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
