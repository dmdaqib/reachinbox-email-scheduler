export type ParsedRecipient = {
  email: string;
  source: 'csv' | 'text' | 'json';
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRecipientList(input: { recipients?: string[]; fileContent?: string }) {
  const parsed = new Map<string, ParsedRecipient>();

  const add = (email: string, source: ParsedRecipient['source']) => {
    const trimmed = email.trim().replace(/^["']|["']$/g, '');
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) return;
    const key = trimmed.toLowerCase();
    if (!parsed.has(key)) {
      parsed.set(key, { email: trimmed, source });
    }
  };

  const directRecipients = Array.isArray(input.recipients) ? input.recipients : [];
  for (const recipient of directRecipients) {
    add(recipient, 'json');
  }

  const fileText = input.fileContent ?? '';
  if (fileText) {
    const lines = fileText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      // Split by comma, semicolon, tab, or whitespace if formatted like list
      const parts = line.split(/[,;\t]/);
      for (const part of parts) {
        add(part, 'csv');
      }
    }
  }

  return Array.from(parsed.values());
}

