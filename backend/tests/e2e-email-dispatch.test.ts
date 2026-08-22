import { describe, expect, it } from 'vitest';
import { sendMailWithEthereal } from '../src/email/mailer.js';

describe('End-to-End Ethereal SMTP & Email Dispatch Verification', () => {
  it('successfully creates Ethereal test account and sends an email via SMTP', async () => {
    const testPayload = {
      from: 'ReachInbox Sender <sender@example.com>',
      to: 'recipient@example.com',
      subject: 'E2E Test Email Verification',
      text: 'Testing Ethereal SMTP dispatch integration',
    };

    const result = await sendMailWithEthereal(testPayload);

    expect(result.messageId).toBeDefined();
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId.length).toBeGreaterThan(0);

    console.log('[TEST VERIFICATION] Ethereal Message ID:', result.messageId);
    console.log('[TEST VERIFICATION] Ethereal Preview URL:', result.previewUrl);
  }, 15000);
});
