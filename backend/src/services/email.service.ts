import { prisma } from '../lib/prisma.js';
import { sendMailWithEthereal } from '../email/mailer.js';

export async function processEmailDispatch(emailId: string): Promise<boolean> {
  console.log(`[DISPATCH-TRACE] START email=${emailId}`);

  const now = new Date();

  // Fetch current state for trace logging
  const initialEmail = await prisma.email.findUnique({ where: { id: emailId } });
  if (initialEmail) {
    console.log(`[DISPATCH-TRACE] status=${initialEmail.status} scheduledAt=${initialEmail.scheduledAt.toISOString()}`);
  }

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

  console.log(`[DISPATCH-TRACE] CLAIM RESULT email=${emailId} count=${claimed.count}`);

  if (claimed.count === 0) {
    return false;
  }

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return false;

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    const error = new Error('Sender not found');
    console.error(`[DISPATCH-ERROR] email=${emailId}`);
    console.error(`[DISPATCH-ERROR] name=${error.name}`);
    console.error(`[DISPATCH-ERROR] message=${error.message}`);
    console.error(`[DISPATCH-ERROR] stack=${error.stack}`);

    console.log(`[DISPATCH-FAIL] BEFORE FAILED UPDATE email=${emailId}`);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: error.message },
    });
    console.log(`[DISPATCH-FAIL] FAILED UPDATE SUCCESS email=${emailId}`);
    return false;
  }

  let smtpResult: { messageId: string; previewUrl?: string } | null = null;

  try {
    console.log(`[DISPATCH-TRACE] BEFORE SMTP email=${emailId}`);
    smtpResult = await sendMailWithEthereal({
      from: `${sender.displayName} <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });
  } catch (error: any) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    console.error(`[DISPATCH-ERROR] email=${emailId}`);
    console.error(`[DISPATCH-ERROR] name=${errObj.name}`);
    console.error(`[DISPATCH-ERROR] message=${errObj.message}`);
    console.error(`[DISPATCH-ERROR] stack=${errObj.stack || errObj.message}`);

    console.log(`[DISPATCH-FAIL] BEFORE FAILED UPDATE email=${emailId}`);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastError: errObj.stack || errObj.message,
      },
    });
    console.log(`[DISPATCH-FAIL] FAILED UPDATE SUCCESS email=${emailId}`);
    return false;
  }

  // SMTP SUCCEEDED! If DB update fails, DO NOT mark as FAILED! Preserve messageId & previewUrl!
  try {
    console.log(`[DISPATCH-TRACE] BEFORE SENT DATABASE UPDATE email=${emailId}`);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        etherealMessageId: smtpResult.messageId,
        previewUrl: smtpResult.previewUrl ?? null,
        lastError: null,
        failedAt: null,
      },
    });
    console.log(`[DISPATCH-TRACE] SENT DATABASE UPDATE SUCCESS email=${emailId}`);
    console.log(`[DISPATCH-TRACE] COMPLETE email=${emailId}`);
    return true;
  } catch (dbError: any) {
    const dbErrObj = dbError instanceof Error ? dbError : new Error(String(dbError));
    console.error(`[DISPATCH-ERROR] DB update to SENT failed for email=${emailId}`);
    console.error(`[DISPATCH-ERROR] name=${dbErrObj.name}`);
    console.error(`[DISPATCH-ERROR] message=${dbErrObj.message}`);
    console.error(`[DISPATCH-ERROR] stack=${dbErrObj.stack || dbErrObj.message}`);

    try {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          etherealMessageId: smtpResult.messageId,
          previewUrl: smtpResult.previewUrl ?? null,
          lastError: `SMTP succeeded (messageId=${smtpResult.messageId}), but DB update notice: ${dbErrObj.message}`,
        },
      });
      console.log(`[DISPATCH-TRACE] SENT DATABASE UPDATE SUCCESS (fallback) email=${emailId}`);
      console.log(`[DISPATCH-TRACE] COMPLETE email=${emailId}`);
      return true;
    } catch (fallbackErr: any) {
      console.error(`[DISPATCH-ERROR] Fatal DB update error for email=${emailId}:`, fallbackErr);
      return false;
    }
  }
}
