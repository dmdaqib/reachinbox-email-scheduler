import { Worker } from 'bullmq';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';
import { processEmailDispatch } from './services/email.service.js';
import { reconcileStaleJobs, startPeriodicReconciliation } from './services/reconcile.service.js';

console.log('[WORKER] started');

const worker = new Worker(
  'email-send',
  async (job) => {
    const emailId = String(job.data.emailId || '');
    if (!emailId) return;

    console.log(`[WORKER] processing email ID ${emailId}`);
    await processEmailDispatch(emailId);
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
startPeriodicReconciliation(5000);
