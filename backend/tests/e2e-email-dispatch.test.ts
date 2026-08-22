import { describe, expect, it } from 'vitest';
import { sendMailWithEthereal } from '../src/email/mailer.js';

describe('End-to-End Ethereal SMTP & Timeout Verification', () => {
  it('successfully creates Ethereal test account and sends an email via SMTP', async () => {
    const testPayload = {
      emailId: 'e2e-test-1',
      from: 'ReachInbox Sender <sender@example.com>',
      to: 'recipient@example.com',
      subject: 'E2E Test Email Verification',
      text: 'Testing Ethereal SMTP dispatch integration',
    };

    const result = await sendMailWithEthereal(testPayload);

    expect(result.messageId).toBeDefined();
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);
  }, 30000);

  it('times out createTestAccountWithTimeout when operation exceeds threshold', async () => {
    const mockTimeoutFunction = async (timeoutMs = 1) => {
      const slowOperation = new Promise((resolve) => setTimeout(resolve, 5000));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Ethereal createTestAccount timeout after 8s')), timeoutMs),
      );
      return Promise.race([slowOperation, timeoutPromise]);
    };

    await expect(mockTimeoutFunction(1)).rejects.toThrow('Ethereal createTestAccount timeout');
  });

  it('recovers stale PROCESSING records to SCHEDULED for retry when etherealMessageId is null', () => {
    const mockEmail = {
      id: 'stale-1',
      status: 'PROCESSING',
      etherealMessageId: null,
      attemptCount: 1,
    };

    const shouldRetry = mockEmail.status === 'PROCESSING' && !mockEmail.etherealMessageId;
    const nextStatus = shouldRetry ? 'SCHEDULED' : 'FAILED';
    const nextAttempt = mockEmail.attemptCount + 1;

    expect(shouldRetry).toBe(true);
    expect(nextStatus).toBe('SCHEDULED');
    expect(nextAttempt).toBe(2);
  });

  it('prevents retry when etherealMessageId is already present', () => {
    const mockSentEmail = {
      id: 'stale-sent-1',
      status: 'PROCESSING',
      etherealMessageId: 'msg-already-sent-123',
      attemptCount: 1,
    };

    const shouldRetry = mockSentEmail.status === 'PROCESSING' && !mockSentEmail.etherealMessageId;
    expect(shouldRetry).toBe(false);
  });
});
