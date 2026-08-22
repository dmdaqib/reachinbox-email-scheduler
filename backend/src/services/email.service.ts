import { prisma } from '../lib/prisma.js';
import { sendMailWithEthereal } from '../email/mailer.js';

export async function processEmailDispatch(emailId: string): Promise<boolean> {
  const graceWindow = new Date(Date.now() + 2000);

  // Atomic claim to prevent double sending (with 2s sub-second clock jitter grace window)
  const claimed = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: 'SCHEDULED',
      scheduledAt: { lte: graceWindow },
      etherealMessageId: null,
    },
    data: { status: 'PROCESSING' },
  });

  if (claimed.count === 0) {
    const existing = await prisma.email.findUnique({ where: { id: emailId } });
    console.log(`[DISPATCH] Email ID ${emailId} claim skipped. Current status: ${existing?.status ?? 'NOT_FOUND'}, scheduledAt: ${existing?.scheduledAt?.toISOString() ?? 'N/A'}`);
    return false;
  }

  console.log(`[DISPATCH] Claimed email ID ${emailId} for dispatch processing`);

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return false;

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: 'Sender not found' },
    });
    console.error(`[DISPATCH Error] Failed email ID ${emailId}: Sender not found`);
    return false;
  }

  try {
    const result = await sendMailWithEthereal({
      emailId,
      from: `${sender.displayName} <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });

    const updated = await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        etherealMessageId: result.messageId,
        previewUrl: result.previewUrl ?? null,
        lastError: null,
        failedAt: null,
      },
    });

    console.log(`[DISPATCH] Successfully updated email ID ${emailId} status to SENT in PostgreSQL (MessageId: ${updated.etherealMessageId}, Preview: ${updated.previewUrl ?? 'N/A'})`);
    return true;
  } catch (error) {
    const nextAttempt = (email.attemptCount ?? 0) + 1;
    const maxAttempts = 3;
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (nextAttempt >= maxAttempts) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          attemptCount: nextAttempt,
          lastError: errorMsg,
        },
      });
      console.error(`[DISPATCH Error] Failed email ID ${emailId} after ${maxAttempts} attempts: ${errorMsg}`);
    } else {
      const retryDelayMs = Math.min(1000 * Math.pow(2, nextAttempt), 30000);
      const retryScheduledAt = new Date(Date.now() + retryDelayMs);
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: retryScheduledAt,
          attemptCount: nextAttempt,
          lastError: `Retry ${nextAttempt}/${maxAttempts}: ${errorMsg}`,
        },
      });
      console.log(`[DISPATCH] Rescheduled email ID ${emailId} for retry ${nextAttempt}/${maxAttempts} in ${retryDelayMs}ms`);
    }
    return false;
  }
}
