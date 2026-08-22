import { prisma } from '../lib/prisma.js';
import { queue } from '../queue/email.queue.js';
import { processEmailDispatch } from './email.service.js';

export async function reconcileStaleJobs() {
  const nowWithGrace = new Date(Date.now() + 2000);

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

  // 2. Process any due SCHEDULED emails (scheduledAt <= NOW + 2s) immediately
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
    console.log(`[RECONCILE] Found ${dueEmails.length} due scheduled emails in PostgreSQL`);
  }

  let dispatchedCount = 0;
  for (const email of dueEmails) {
    const success = await processEmailDispatch(email.id);
    if (success) {
      dispatchedCount += 1;
    }
  }

  // 3. Re-enqueue future SCHEDULED emails (scheduledAt > NOW + 2s) missing an active BullMQ job
  let reQueuedCount = 0;
  try {
    const futureScheduledEmails = await prisma.email.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gt: nowWithGrace },
        etherealMessageId: null,
      },
    });

    for (const email of futureScheduledEmails) {
      const jobId = `email-${email.id}`;
      try {
        const getJobPromise = queue.getJob(jobId);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
        const existingJob = await Promise.race([getJobPromise, timeoutPromise]);
        const state = existingJob ? await existingJob.getState().catch(() => null) : null;

        if (state === 'delayed' || state === 'waiting' || state === 'active') {
          continue;
        }

        if (existingJob) {
          await existingJob.remove().catch(() => {});
        }

        const delay = Math.max(0, new Date(email.scheduledAt).getTime() - Date.now());
        await queue.add(
          'email-send',
          { emailId: email.id },
          {
            jobId,
            delay,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
        console.log(`[QUEUE] Re-enqueued future email ID ${email.id} (Delay: ${delay}ms)`);
        reQueuedCount += 1;
      } catch {
        // Safe timeout fallback
      }
    }
  } catch {
    // Timeout fallback
  }

  if (dispatchedCount > 0 || reQueuedCount > 0) {
    console.log(`[RECONCILE] Completed scan: Dispatched ${dispatchedCount} due emails, re-queued ${reQueuedCount} future jobs.`);
  }

  return { dispatchedCount, reQueuedCount, staleCount: staleProcessing.length };
}

let periodicTimer: NodeJS.Timeout | null = null;

export function startPeriodicReconciliation(intervalMs = 5000) {
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
