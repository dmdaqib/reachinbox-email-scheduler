import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMailViaBrevoApi } from '../src/email/mailer.js';

describe('Brevo REST API Mailer Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('successfully sends email via Brevo REST API and returns messageId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<202608221600.123456@smtp-relay.mailin.fr>' }),
    } as any);

    const result = await sendMailViaBrevoApi({
      emailId: 'test-email-123',
      apiKey: 'test-brevo-api-key',
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      text: 'Test Body',
    });

    expect(result.messageId).toBe('<202608221600.123456@smtp-relay.mailin.fr>');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'test-brevo-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('handles Brevo API HTTP 400 error and throws formatted error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'unauthorized', message: 'Key not found in database' }),
    } as any);

    await expect(
      sendMailViaBrevoApi({
        emailId: 'test-email-456',
        apiKey: 'invalid-key',
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test Body',
      }),
    ).rejects.toThrow('Brevo REST API Error (400): Key not found in database');
  });
});
