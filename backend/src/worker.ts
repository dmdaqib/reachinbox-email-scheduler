import { Worker } from 'bullmq';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';
import { sendMailWithEthereal } from './email/mailer.js';
import { checkMinDelayGap, reserveHourlySlot } from './queue/rateLimit.js';
import { nextHourUTC } from './services/slotPlanner.js';
import { queue } from './queue/email.queue.js';

const worker = new Worker(
  'email-send',
  async (job) => {
    const emailId = String(job.data.emailId || '');
    if (!emailId) return;

    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) return;
    if (email.status === 'SENT' || email.etherealMessageId) return;
    if (email.status === 'FAILED') return;

    const claimed = await prisma.email.updateMany({
      where: {
        id: emailId,
        status: { in: ['SCHEDULED', 'PROCESSING'] },
        etherealMessageId: null,
      },
      data: { status: 'PROCESSING' },
    });

    if (claimed.count === 0) return;

    const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
    if (!sender) {
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'FAILED', failedAt: new Date(), lastError: 'Sender not found' },
      });
      return;
    }

    const minDelayWait = await checkMinDelayGap(sender.id, Math.max(email.delayMs, env.MIN_EMAIL_DELAY_MS));
    if (minDelayWait > 0) {
      const delayedAt = new Date(Date.now() + minDelayWait);
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: delayedAt,
          lastError: `Rate-limited by min delay: ${minDelayWait}ms`,
        },
      });

      const queuedJob = await queue.getJob(`email:${emailId}`);
      if (queuedJob) await queuedJob.remove();
      await queue.add('email-send', { emailId }, { jobId: `email:${emailId}`, delay: minDelayWait });
      return;
    }

    const utcHourKey = new Date().toISOString().slice(0, 13);
    const allowed = await reserveHourlySlot(sender.id, utcHourKey, email.hourlyLimit);
    if (!allowed) {
      const nextWindow = nextHourUTC(new Date());
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: nextWindow,
          lastError: 'Hourly capacity exceeded; rescheduled to next UTC hour',
        },
      });
      const queuedJob = await queue.getJob(`email:${emailId}`);
      if (queuedJob) await queuedJob.remove();
      await queue.add('email-send', { emailId }, { jobId: `email:${emailId}`, delay: Math.max(0, nextWindow.getTime() - Date.now()) });
      return;
    }

    try {
      const result = await sendMailWithEthereal({
        from: `${sender.displayName} <${sender.email}>`,
        to: email.toEmail,
        subject: email.subject,
        text: email.body,
      });

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          etherealMessageId: result.messageId,
          previewUrl: result.previewUrl ?? null,
          lastError: null,
          failedAt: null,
        },
      });
    } catch (error) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          attemptCount: { increment: 1 },
          lastError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
  },
);

worker.on('completed', (job) => {
  console.log('Job completed', job.name, job.id);
});

worker.on('failed', (job, error) => {
  console.error('Worker job failed', job?.name, job?.id, error.message);
});

import { reconcileStaleJobs } from './services/reconcile.service.js';

console.log('Email worker started');
reconcileStaleJobs().catch((err) => console.error('Worker reconciliation error:', err));

