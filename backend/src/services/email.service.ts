import { prisma } from '../lib/prisma.js';
import { sendMailWithEthereal } from '../email/mailer.js';

export async function processEmailDispatch(emailId: string): Promise<boolean> {
  console.log(`[DISPATCH-TRACE] processEmailDispatch START email=${emailId}`);

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
    const existing = await prisma.email.findUnique({ where: { id: emailId } });
    console.log(`[DISPATCH-TRACE] claim skipped for email=${emailId}. Current DB status=${existing?.status ?? 'NOT_FOUND'}, scheduledAt=${existing?.scheduledAt?.toISOString() ?? 'N/A'}`);
    return false;
  }

  console.log(`[DISPATCHER] claimed ${emailId}`);

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return false;

  console.log(`[DISPATCH-TRACE] email status=${email.status} recipient=${email.toEmail} scheduledAt=${email.scheduledAt.toISOString()}`);

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    const errorMsg = 'Sender not found';
    console.log(`[DISPATCH-FAIL] ABOUT TO MARK FAILED email=${emailId} error=${errorMsg}`);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: errorMsg },
    });
    console.log(`[DISPATCH-FAIL] MARKED FAILED email=${emailId}`);
    return false;
  }

  try {
    console.log(`[DISPATCH-TRACE] BEFORE SMTP email=${emailId}`);
    const result = await sendMailWithEthereal({
      from: `${sender.displayName} <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });

    const finalMessageId = result.messageId || `msg-${Date.now()}`;
    console.log(`[DISPATCH-TRACE] AFTER SMTP SUCCESS email=${emailId} messageId=${finalMessageId}`);

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
    const fullError = error instanceof Error ? (error.stack || error.message) : String(error);
    console.error(`[DISPATCH-TRACE] SMTP/DISPATCH EXCEPTION email=${emailId} error=${fullError}`);

    console.log(`[DISPATCH-FAIL] ABOUT TO MARK FAILED email=${emailId} error=${fullError}`);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastError: fullError,
      },
    });
    console.log(`[DISPATCH-FAIL] MARKED FAILED email=${emailId}`);
    return false;
  }
}
