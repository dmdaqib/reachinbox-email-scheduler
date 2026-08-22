import { prisma } from '../lib/prisma.js';
import { processEmailDispatch } from './email.service.js';

let dispatchRunning = false;

export async function runDispatcherTick() {
  const timestamp = new Date().toISOString();
  console.log(`[DISPATCH-LIFECYCLE] timer callback FIRED PID=${process.pid} time=${timestamp}`);

  if (dispatchRunning) {
    console.log(`[DISPATCH-DEBUG] Tick skipped: previous tick still in progress at ${timestamp}`);
    return;
  }

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

    console.log(`[DISPATCHER] TICK PID=${process.pid} time=${timestamp} found=${dueEmails.length}`);

    for (const email of dueEmails) {
      console.log(`[DISPATCH-LIFECYCLE] processEmailDispatch ENTERED email=${email.id}`);
      try {
        await processEmailDispatch(email.id);
        console.log(`[DISPATCH-LIFECYCLE] processEmailDispatch COMPLETED email=${email.id}`);
      } catch (err: any) {
        console.error(`[DISPATCH-LIFECYCLE] processEmailDispatch ERROR email=${email.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[DISPATCH-LIFECYCLE] timer callback ERROR ${errorMsg}`);
  } finally {
    dispatchRunning = false;
  }
}

let dispatcherTimer: NodeJS.Timeout | null = null;

export function startDispatcher(intervalMs = 2000) {
  console.log(`[DISPATCH-LIFECYCLE] start() ENTERED PID=${process.pid}`);
  if (dispatcherTimer) {
    console.log(`[DISPATCH-DEBUG] startDispatcher skipped: timer already registered PID=${process.pid}`);
    return;
  }

  console.log(`[DISPATCHER] Started ${intervalMs}ms PostgreSQL email dispatch loop PID=${process.pid}`);
  runDispatcherTick().catch((err) => console.error('[DISPATCH-LIFECYCLE] initial tick ERROR:', err));

  dispatcherTimer = setInterval(() => {
    runDispatcherTick().catch((err) => console.error('[DISPATCH-LIFECYCLE] interval tick ERROR:', err));
  }, intervalMs);

  console.log(`[DISPATCH-LIFECYCLE] timer registered interval=${intervalMs}ms PID=${process.pid}`);
}
