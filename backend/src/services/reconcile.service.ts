import { prisma } from '../lib/prisma.js';
import { queue } from '../queue/email.queue.js';
import { processEmailDispatch } from './email.service.js';

export async function reconcileStaleJobs() {
  // 1. Recover stale PROCESSING emails (older than 1 minute)
  const staleProcessing = await prisma.email.findMany({
    where: {
      status: 'PROCESSING',
      etherealMessageId: null,
      updatedAt: { lt: new Date(Date.now() - 60 * 1000) },
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

  // 2. Process any due SCHEDULED emails (scheduledAt <= NOW) immediately
  const dueEmails = await prisma.email.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: new Date() },
      etherealMessageId: null,
    },
    take: 50,
    orderBy: { scheduledAt: 'asc' },
  });

  let dispatchedCount = 0;
  for (const email of dueEmails) {
    const success = await processEmailDispatch(email.id);
    if (success) {
      dispatchedCount += 1;
    }
  }

  // 3. Re-enqueue future SCHEDULED emails (scheduledAt > NOW) missing an active BullMQ job
  const futureScheduledEmails = await prisma.email.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { gt: new Date() },
      etherealMessageId: null,
    },
  });

  let reQueuedCount = 0;
  for (const email of futureScheduledEmails) {
    const jobId = `email-${email.id}`;
    const existingJob = await queue.getJob(jobId);
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
    console.log(`[QUEUE] enqueued future email ID ${email.id}`);
    reQueuedCount += 1;
  }

  if (dueEmails.length > 0 || reQueuedCount > 0) {
    console.log(`[RECONCILE] Processed ${dispatchedCount} due emails, re-queued ${reQueuedCount} future jobs.`);
  }

  return { dispatchedCount, reQueuedCount, staleCount: staleProcessing.length };
}

let periodicTimer: NodeJS.Timeout | null = null;

export function startPeriodicReconciliation(intervalMs = 5000) {
  if (periodicTimer) return;
  periodicTimer = setInterval(async () => {
    try {
      await reconcileStaleJobs();
    } catch (err) {
      console.error('[RECONCILE Error] Periodic reconciliation error:', err);
    }
  }, intervalMs);
}
