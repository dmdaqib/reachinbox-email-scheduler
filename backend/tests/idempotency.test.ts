import { describe, expect, it } from 'vitest';
import { parseRecipientList } from '../src/email/parseRecipients.js';

describe('idempotency and dedupe', () => {
  it('deduplicates repeated recipient addresses before scheduling', () => {
    const recipients = parseRecipientList({
      recipients: ['alpha@example.com', 'ALPHA@example.com', 'beta@example.com'],
    });

    expect(recipients.map((item) => item.email)).toEqual(['alpha@example.com', 'beta@example.com']);
  });
});
