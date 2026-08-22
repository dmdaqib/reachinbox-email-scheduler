import { Worker } from 'bullmq';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';
import { sendMailWithEthereal } from './email/mailer.js';
import { checkMinDelayGap, reserveHourlySlot } from './queue/rateLimit.js';
import { nextHourUTC } from './services/slotPlanner.js';
import { queue } from './queue/email.queue.js';
import { reconcileStaleJobs, startPeriodicReconciliation } from './services/reconcile.service.js';

console.log('[WORKER] started');

const worker = new Worker(
  'email-send',
  async (job) => {
    const emailId = String(job.data.emailId || '');
    if (!emailId) return;

    console.log(`[WORKER] processing email ID ${emailId}`);

    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) return;
    if (email.status === 'SENT' || email.etherealMessageId) return;
    if (email.status === 'FAILED') return;

    // Safety guard: Ensure job is never dispatched before its persisted scheduledAt timestamp
    const remainingDelay = new Date(email.scheduledAt).getTime() - Date.now();
    if (remainingDelay > 100) {
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'SCHEDULED' },
      });
      await queue.add(
        'email-send',
        { emailId },
        {
          jobId: `email-${emailId}-early-${Date.now()}`,
          delay: remainingDelay,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return;
    }

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
      console.error(`[WORKER] failed email ID ${emailId}: Sender not found`);
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

      await queue.add(
        'email-send',
        { emailId },
        {
          jobId: `email-${emailId}-delay-${delayedAt.getTime()}`,
          delay: minDelayWait,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
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

      await queue.add(
        'email-send',
        { emailId },
        {
          jobId: `email-${emailId}-hour-${nextWindow.getTime()}`,
          delay: Math.max(0, nextWindow.getTime() - Date.now()),
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
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
      console.log(`[WORKER] sent email ID ${emailId}`);
    } catch (error) {
      const nextAttempt = email.attemptCount + 1;
      const maxAttempts = 3;

      if (nextAttempt >= maxAttempts) {
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            attemptCount: nextAttempt,
            lastError: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        console.error(`[WORKER] failed email ID ${emailId}: ${error instanceof Error ? error.message : error}`);
      } else {
        const retryDelayMs = Math.min(1000 * Math.pow(2, nextAttempt), 30000);
        const retryScheduledAt = new Date(Date.now() + retryDelayMs);
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'SCHEDULED',
            scheduledAt: retryScheduledAt,
            attemptCount: nextAttempt,
            lastError: `Retry ${nextAttempt}/${maxAttempts}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        });
        await queue.add(
          'email-send',
          { emailId },
          {
            jobId: `email-${emailId}-retry-${nextAttempt}-${Date.now()}`,
            delay: retryDelayMs,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      }
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 30000,
    stalledInterval: 30000,
    maxStalledCount: 3,
  },
);

worker.on('completed', (job) => {
  console.log(`[WORKER] completed job ${job.name} (ID: ${job.id})`);
});

worker.on('failed', (job, error) => {
  console.error(`[WORKER] failed job ${job?.name} (ID: ${job?.id}): ${error.message}`);
});

reconcileStaleJobs().catch((err) => console.error('[RECONCILE Error] Startup reconciliation failed:', err));
startPeriodicReconciliation(30000);
