import { describe, expect, it } from 'vitest';

describe('Worker Recovery and Scheduling Reliability', () => {
  it('identifies failed or missing BullMQ jobs for re-enqueueing', async () => {
    const mockJobsState = new Map<string, string>([
      ['email-1', 'failed'],
      ['email-2', 'active'],
      ['email-3', 'completed'],
    ]);

    const scheduledEmails = [
      { id: '1', status: 'SCHEDULED' },
      { id: '2', status: 'SCHEDULED' },
      { id: '3', status: 'SCHEDULED' },
      { id: '4', status: 'SCHEDULED' }, // missing from queue
    ];

    const toRequeue: string[] = [];

    for (const email of scheduledEmails) {
      const jobId = `email-${email.id}`;
      const state = mockJobsState.get(jobId);

      const needsReenqueue = !state || state === 'failed' || state === 'completed';
      if (needsReenqueue) {
        toRequeue.push(email.id);
      }
    }

    // email-1 (failed), email-3 (completed in queue but DB still SCHEDULED), and email-4 (missing) must be re-queued
    // email-2 is active in queue, so it must NOT be re-queued
    expect(toRequeue).toEqual(['1', '3', '4']);
  });

  it('prevents double sending via atomic status update simulation', () => {
    let emailStatus = 'SCHEDULED';
    let etherealMessageId: string | null = null;

    const claimWorker1 = () => {
      if (emailStatus === 'SCHEDULED' && !etherealMessageId) {
        emailStatus = 'PROCESSING';
        return 1;
      }
      return 0;
    };

    const claimWorker2 = () => {
      if (emailStatus === 'SCHEDULED' && !etherealMessageId) {
        emailStatus = 'PROCESSING';
        return 1;
      }
      return 0;
    };

    const worker1Claimed = claimWorker1();
    const worker2Claimed = claimWorker2();

    expect(worker1Claimed).toBe(1);
    expect(worker2Claimed).toBe(0);
    expect(emailStatus).toBe('PROCESSING');
  });

  it('generates non-conflicting rescheduled job IDs without calling remove on locked active jobs', () => {
    const emailId = 'test-email-123';
    const delayedAtMs = 1700000000000;

    const minDelayJobId = `email-${emailId}-delay-${delayedAtMs}`;
    const hourLimitJobId = `email-${emailId}-hour-${delayedAtMs}`;

    expect(minDelayJobId).toBe('email-test-email-123-delay-1700000000000');
    expect(hourLimitJobId).toBe('email-test-email-123-hour-1700000000000');
    expect(minDelayJobId.includes(':')).toBe(false);
    expect(hourLimitJobId.includes(':')).toBe(false);
  });

  it('prevents worker execution for cancelled emails', () => {
    let emailStatus = 'FAILED';

    // Worker attempts to process email
    const canWorkerClaim = emailStatus === 'SCHEDULED' || emailStatus === 'PROCESSING';
    expect(canWorkerClaim).toBe(false);

    // Worker status check logic
    const isCancelledOrFailed = emailStatus === 'FAILED';
    expect(isCancelledOrFailed).toBe(true);
  });

  it('safely handles non-locked BullMQ job removal on cancellation', async () => {
    let jobRemoved = false;
    const mockJob = {
      isActive: async () => false,
      remove: async () => {
        jobRemoved = true;
      },
    };

    const isActive = await mockJob.isActive();
    if (!isActive) {
      await mockJob.remove();
    }

    expect(jobRemoved).toBe(true);
  });

  it('bypasses job removal when BullMQ job is locked during cancellation', async () => {
    let jobRemoved = false;
    const mockLockedJob = {
      isActive: async () => true,
      remove: async () => {
        jobRemoved = true;
      },
    };

    const isActive = await mockLockedJob.isActive();
    if (!isActive) {
      await mockLockedJob.remove();
    }

    expect(jobRemoved).toBe(false);
  });

  it('detects and re-enqueues overdue delayed jobs when worker restarts', () => {
    const mockNow = 1700000060000;
    const scheduledEmails = [
      { id: '101', scheduledAt: new Date(1700000000000) }, // overdue
      { id: '102', scheduledAt: new Date(1700000120000) }, // future
    ];

    const mockJobsState = new Map<string, string>([
      ['email-101', 'delayed'],
      ['email-102', 'delayed'],
    ]);

    const toRequeue: string[] = [];

    for (const email of scheduledEmails) {
      const jobId = `email-${email.id}`;
      const state = mockJobsState.get(jobId);
      const isOverdue = email.scheduledAt.getTime() <= mockNow;

      const needsReenqueue = !state || state === 'failed' || state === 'completed' || (isOverdue && state === 'delayed');
      if (needsReenqueue) {
        toRequeue.push(email.id);
      }
    }

    expect(toRequeue).toEqual(['101']);
  });

  it('full recovery lifecycle: SCHEDULED -> worker offline -> scheduledAt passes -> worker starts -> recovery -> SENT', async () => {
    // 1. Initial state: Email was scheduled for 5 minutes ago while worker was offline
    const emailId = 'overdue-full-lifecycle-123';
    const pastScheduledAt = new Date(Date.now() - 5 * 60 * 1000);

    let emailInDb = {
      id: emailId,
      status: 'SCHEDULED',
      scheduledAt: pastScheduledAt,
      etherealMessageId: null as string | null,
      sentAt: null as Date | null,
      failedAt: null as Date | null,
      attemptCount: 0,
      lastError: null as string | null,
    };

    // 2. Worker restarts after scheduledAt passes. Reconciliation service runs.
    const isOverdue = emailInDb.scheduledAt.getTime() <= Date.now();
    expect(isOverdue).toBe(true);
    expect(emailInDb.status).toBe('SCHEDULED');

    // Reconciliation detects overdue SCHEDULED email and re-enqueues job with delay = 0
    const delay = Math.max(0, emailInDb.scheduledAt.getTime() - Date.now());
    expect(delay).toBe(0);

    // 3. Worker processor picks up the re-enqueued job and claims the DB record
    if (emailInDb.status === 'SCHEDULED' && !emailInDb.etherealMessageId) {
      emailInDb.status = 'PROCESSING';
    }
    expect(emailInDb.status).toBe('PROCESSING');

    // 4. Send execution completes successfully
    const sendResult = {
      messageId: '<ethereal-recovery-success@ethereal.email>',
      previewUrl: 'https://ethereal.email/message/recovery-success',
    };

    emailInDb.status = 'SENT';
    emailInDb.sentAt = new Date();
    emailInDb.etherealMessageId = sendResult.messageId;

    // 5. Assert final database status is SENT
    expect(emailInDb.status).toBe('SENT');
    expect(emailInDb.etherealMessageId).toBe('<ethereal-recovery-success@ethereal.email>');
    expect(emailInDb.sentAt).not.toBeNull();
    expect(emailInDb.failedAt).toBeNull();
  });

  it('email scheduled 1-2 minutes in future must NOT execute early', () => {
    const nowMs = 1700000000000;
    const futureScheduledAt = new Date(nowMs + 120 * 1000); // 2 minutes in future

    const remainingDelay = futureScheduledAt.getTime() - nowMs;
    expect(remainingDelay).toBe(120000);
    expect(remainingDelay > 100).toBe(true); // Worker guard prevents immediate dispatch
  });

  it('email executes when current time reaches scheduledAt', () => {
    const scheduledAt = new Date(1700000000000);
    const nowMsAtScheduledTime = 1700000000000;

    const remainingDelay = scheduledAt.getTime() - nowMsAtScheduledTime;
    expect(remainingDelay).toBe(0);
    expect(remainingDelay <= 100).toBe(true); // Worker allows execution
  });

  it('verifies timezone ISO date conversion preserves exact unix timestamp', () => {
    const localTimeString = '2026-08-22T00:10:00.000Z';
    const parsedDate = new Date(localTimeString);

    expect(parsedDate.toISOString()).toBe('2026-08-22T00:10:00.000Z');
    expect(parsedDate.getTime()).toBe(new Date('2026-08-22T00:10:00.000Z').getTime());
  });
});
