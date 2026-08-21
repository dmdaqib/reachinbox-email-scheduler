import { prisma } from '../lib/prisma.js';
import { queue } from '../queue/email.queue.js';

export async function reconcileStaleJobs() {
  console.log('[Reconcile] Running startup job reconciliation...');

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

  // 2. Re-enqueue any SCHEDULED emails missing an active/waiting BullMQ job
  const scheduledEmails = await prisma.email.findMany({
    where: {
      status: 'SCHEDULED',
      etherealMessageId: null,
    },
  });

  let reQueuedCount = 0;
  for (const email of scheduledEmails) {
    const isOverdue = new Date(email.scheduledAt).getTime() <= Date.now();
    const jobId = `email-${email.id}`;
    const overdueJobId = `email-${email.id}-overdue`;
    const targetJobId = isOverdue ? overdueJobId : jobId;

    const existingJob = await queue.getJob(jobId);
    const existingOverdueJob = isOverdue ? await queue.getJob(overdueJobId) : null;

    const mainState = existingJob ? await existingJob.getState().catch(() => null) : null;
    const overdueState = existingOverdueJob ? await existingOverdueJob.getState().catch(() => null) : null;

    const isAlive = (state: string | null) => state === 'waiting' || state === 'active' || (state === 'delayed' && !isOverdue);

    if (isAlive(mainState) || isAlive(overdueState)) {
      continue;
    }

    if (existingJob) {
      await existingJob.remove().catch(() => {});
    }
    if (existingOverdueJob) {
      await existingOverdueJob.remove().catch(() => {});
    }

    const delay = Math.max(0, new Date(email.scheduledAt).getTime() - Date.now());
    await queue.add(
      'email-send',
      { emailId: email.id },
      {
        jobId: targetJobId,
        delay,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    reQueuedCount += 1;
  }

  console.log(`[Reconcile] Completed. Restored ${reQueuedCount} missing BullMQ delayed jobs.`);
  return { reQueuedCount, staleCount: staleProcessing.length };
}

