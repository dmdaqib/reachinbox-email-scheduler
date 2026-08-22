import { prisma } from '../lib/prisma.js';
import { sendMailWithEthereal } from '../email/mailer.js';

export async function processEmailDispatch(emailId: string): Promise<boolean> {
  const now = new Date();

  // Atomic claim mechanism: only process if status is SCHEDULED and scheduledAt <= NOW
  const claimed = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
      etherealMessageId: null,
    },
    data: { status: 'PROCESSING' },
  });

  if (claimed.count === 0) {
    return false;
  }

  console.log(`[DISPATCHER] claimed ${emailId}`);

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return false;

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: 'Sender not found' },
    });
    console.error(`[DISPATCHER Error] Sender not found for email ${emailId}`);
    return false;
  }

  try {
    const result = await sendMailWithEthereal({
      from: `${sender.displayName} <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });

    const finalMessageId = result.messageId || `msg-${Date.now()}`;

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        etherealMessageId: finalMessageId,
        previewUrl: result.previewUrl ?? null,
        lastError: null,
        failedAt: null,
      },
    });

    console.log(`[DISPATCHER] marked ${emailId} as SENT`);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastError: errorMsg,
      },
    });
    console.error(`[DISPATCHER] marked ${emailId} as FAILED: ${errorMsg}`);
    return false;
  }
}
