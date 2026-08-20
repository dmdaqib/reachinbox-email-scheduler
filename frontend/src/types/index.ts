export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
};

export type Sender = {
  id: string;
  email: string;
  displayName: string;
  hourlyLimit?: number | null;
  isDefault?: boolean;
};

export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export type EmailRow = {
  id: string;
  toEmail: string;
  subject: string;
  body?: string;
  status: EmailStatus;
  scheduledAt?: string;
  sentAt?: string | null;
  failedAt?: string | null;
  etherealMessageId?: string | null;
  previewUrl?: string | null;
  lastError?: string | null;
  attemptCount?: number;
};
