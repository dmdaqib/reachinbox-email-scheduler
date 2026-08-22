import { randomUUID } from 'crypto';
import type { Prisma, Sender } from '@prisma/client';
import { EmailStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { parseRecipientList } from '../email/parseRecipients.js';
import { planScheduledWindows } from './slotPlanner.js';

export type ScheduleRequest = {
  subject: string;
  body: string;
  startAt: string;
  delayMs?: number;
  hourlyLimit?: number;
  senderId?: string;
  recipients?: string[];
  fileContent?: string;
};

export async function scheduleEmailsForUser(userId: string, input: ScheduleRequest) {
  const subject = input.subject?.trim();
  const body = input.body ?? '';
  if (!subject) throw new Error('Subject is required');
  if (!body) throw new Error('Body is required');

  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw new Error('startAt must be a valid ISO date');

  const sender = input.senderId
    ? await prisma.sender.findFirst({ where: { id: input.senderId, userId } })
    : await prisma.sender.findFirst({ where: { userId, isDefault: true } });

  if (!sender) throw new Error('Sender not found');

  const requestedDelayMs = Number.isFinite(input.delayMs) ? Number(input.delayMs) : 0;
  const effectiveDelayMs = Math.max(requestedDelayMs, env.MIN_EMAIL_DELAY_MS);
  const defaultLimit = sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR;
  const requestedHourlyLimit = Number.isFinite(input.hourlyLimit) ? Number(input.hourlyLimit) : undefined;
  const effectiveHourlyLimit = requestedHourlyLimit
    ? Math.min(requestedHourlyLimit, defaultLimit)
    : defaultLimit;

  const recipients = parseRecipientList({
    recipients: input.recipients ?? [],
    fileContent: input.fileContent ?? '',
  });

  if (recipients.length === 0) {
    throw new Error('No valid recipients were found');
  }

  const uniqueRecipients = Array.from(new Set(recipients.map((r) => r.email.toLowerCase())));
  const plannedWindows = planScheduledWindows({
    startAt,
    delayMs: effectiveDelayMs,
    hourlyLimit: effectiveHourlyLimit,
    total: uniqueRecipients.length,
  });

  const preparedRows = uniqueRecipients.map((email, index) => {
    const scheduledAt = plannedWindows[index]?.scheduledAt ?? new Date(startAt.getTime() + index * effectiveDelayMs);
    const emailId = randomUUID();
    const bullmqJobId = `email-${emailId}`;

    return {
      id: emailId,
      userId,
      senderId: sender.id,
      toEmail: email,
      subject,
      body,
      status: EmailStatus.SCHEDULED,
      scheduledAt,
      delayMs: effectiveDelayMs,
      hourlyLimit: effectiveHourlyLimit,
      bullmqJobId,
    } satisfies Prisma.EmailCreateManyInput;
  });

  // Save scheduled email records to PostgreSQL and return HTTP 200 immediately
  await prisma.email.createMany({ data: preparedRows });

  const records = (await prisma.email.findMany({
    where: { id: { in: preparedRows.map((row) => row.id) } },
    orderBy: { createdAt: 'asc' },
  })) as Array<{
    id: string;
    toEmail: string;
    scheduledAt: Date;
    status: string;
  }>;

  console.log('[SCHEDULE-DIAG] CREATE SUCCESS');
  records.forEach((rec) => {
    console.log(`[SCHEDULE-DIAG] emailId=${rec.id}`);
    console.log(`[SCHEDULE-DIAG] status=${rec.status}`);
    console.log(`[SCHEDULE-DIAG] scheduledAt=${rec.scheduledAt.toISOString()}`);
    console.log(`[SCHEDULE-DIAG] serverNow=${new Date().toISOString()}`);

    console.log('[SCHEDULE-TIME-TRACE]');
    console.log(`[SCHEDULE-TIME-TRACE] clientValue=${input.startAt}`);
    console.log(`[SCHEDULE-TIME-TRACE] serverParsed=${startAt.toISOString()}`);
    console.log(`[SCHEDULE-TIME-TRACE] databaseValue=${rec.scheduledAt.toISOString()}`);
    console.log(`[SCHEDULE-TIME-TRACE] serverNow=${new Date().toISOString()}`);
    console.log(`[SCHEDULE-TIME-TRACE] differenceMs=${rec.scheduledAt.getTime() - Date.now()}`);
  });

  return {
    acceptedCount: records.length,
    rejectedCount: Math.max(recipients.length - records.length, 0),
    emails: records.map((email) => ({
      id: email.id,
      toEmail: email.toEmail,
      scheduledAt: email.scheduledAt,
      status: email.status,
    })),
  };
}

export function findDefaultSenderForUser(userId: string) {
  return prisma.sender.findFirst({ where: { userId, isDefault: true } });
}

export function getUserSenders(userId: string) {
  return prisma.sender.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

export function createSenderForUser(userId: string, data: Partial<Sender> & { email: string; displayName: string }) {
  return prisma.sender.create({
    data: {
      userId,
      email: data.email,
      displayName: data.displayName,
      smtpHost: data.smtpHost || 'smtp.ethereal.email',
      smtpPort: data.smtpPort || 587,
      smtpUser: data.smtpUser || data.email,
      smtpPass: data.smtpPass || 'change-me',
      isDefault: !!data.isDefault,
      hourlyLimit: data.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR,
    },
  });
}

export async function cancelScheduledEmail(userId: string, emailId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
  });

  if (!email) {
    throw new Error('Email not found');
  }

  if (email.status !== EmailStatus.SCHEDULED) {
    throw new Error(`Cannot cancel email with status '${email.status}'`);
  }

  console.log(`[DISPATCH-FAIL] ABOUT TO MARK FAILED email=${emailId} error=Cancelled by user`);
  await prisma.email.updateMany({
    where: { id: emailId, userId, status: EmailStatus.SCHEDULED },
    data: {
      status: EmailStatus.FAILED,
      failedAt: new Date(),
      lastError: 'Cancelled by user',
    },
  });
  console.log(`[DISPATCH-FAIL] MARKED FAILED email=${emailId}`);

  return { success: true, emailId };
}
