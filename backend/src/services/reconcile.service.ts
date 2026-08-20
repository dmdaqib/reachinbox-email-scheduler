import { prisma } from '../lib/prisma.js';
import { queue } from '../queue/email.queue.js';

export async function reconcileStaleJobs() {
  console.log('[Reconcile] Running startup job reconciliation...');

  // 1. Recover stale PROCESSING emails (older than 5 minutes)
  const staleProcessing = await prisma.email.findMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
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

  // 2. Re-enqueue any SCHEDULED emails missing a BullMQ job
  const scheduledEmails = await prisma.email.findMany({
    where: {
      status: 'SCHEDULED',
      etherealMessageId: null,
    },
  });

  let reQueuedCount = 0;
  for (const email of scheduledEmails) {
    const jobId = `email:${email.id}`;
    const existingJob = await queue.getJob(jobId);

    if (!existingJob) {
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
      reQueuedCount += 1;
    }
  }

  console.log(`[Reconcile] Completed. Restored ${reQueuedCount} missing BullMQ delayed jobs.`);
  return { reQueuedCount, staleCount: staleProcessing.length };
}

