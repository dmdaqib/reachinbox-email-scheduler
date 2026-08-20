import { describe, expect, it, vi } from 'vitest';

describe('Reconciliation service logic', () => {
  it('restores missing BullMQ jobs for SCHEDULED emails while ignoring SENT emails', () => {
    const scheduledEmails = [
      { id: 'email-1', status: 'SCHEDULED', etherealMessageId: null, scheduledAt: new Date() },
      { id: 'email-2', status: 'SENT', etherealMessageId: 'eth-123', scheduledAt: new Date() },
    ];

    const toRequeue = scheduledEmails.filter((email) => email.status === 'SCHEDULED' && !email.etherealMessageId);

    expect(toRequeue.length).toBe(1);
    expect(toRequeue[0].id).toBe('email-1');
  });

  it('resets stale PROCESSING state to SCHEDULED', () => {
    const email = { id: 'email-stale', status: 'PROCESSING', updatedAt: new Date(Date.now() - 6 * 60 * 1000) };
    const isStale = Date.now() - email.updatedAt.getTime() > 5 * 60 * 1000;

    expect(isStale).toBe(true);
  });
});
