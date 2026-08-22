import { prisma } from '../lib/prisma.js';
import { sendMailWithEthereal } from '../email/mailer.js';

export async function processEmailDispatch(emailId: string): Promise<boolean> {
  // Atomic claim to prevent duplicate sends
  const claimed = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: 'SCHEDULED',
      scheduledAt: { lte: new Date() },
      etherealMessageId: null,
    },
    data: { status: 'PROCESSING' },
  });

  if (claimed.count === 0) {
    return false;
  }

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return false;

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: 'Sender not found' },
    });
    console.error(`[WORKER] failed email ID ${emailId}: Sender not found`);
    return false;
  }

  try {
    console.log(`[WORKER] sending email ID ${emailId} to ${email.toEmail}...`);
    const result = await sendMailWithEthereal({
      from: `${sender.displayName} <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        etherealMessageId: result.messageId ?? `msg-${Date.now()}`,
        previewUrl: result.previewUrl ?? null,
        lastError: null,
        failedAt: null,
      },
    });
    console.log(`[WORKER] sent email ID ${emailId} successfully (MessageId: ${result.messageId})`);
    return true;
  } catch (error) {
    const nextAttempt = email.attemptCount + 1;
    const maxAttempts = 3;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

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
      console.error(`[WORKER] failed email ID ${emailId} after ${maxAttempts} attempts: ${errorMsg}`);
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
    }
    return false;
  }
}
