import { describe, expect, it } from 'vitest';
import { parseRecipientList } from '../src/email/parseRecipients.js';

describe('parseRecipientList', () => {
  it('deduplicates and validates recipients', () => {
    const recipients = parseRecipientList({
      recipients: ['a@example.com', 'A@example.com', 'invalid', 'b@example.com'],
      fileContent: 'c@example.com\ninvalid\nd@example.com',
    });

    expect(recipients.map((item) => item.email)).toEqual(['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']);
  });
});
