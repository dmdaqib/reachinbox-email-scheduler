import { prisma } from '../lib/prisma.js';
import { sendMailWithEthereal } from '../email/mailer.js';

export async function processEmailDispatch(emailId: string): Promise<boolean> {
  console.log(`[DISPATCH-TRACE] START email=${emailId}`);

  const now = new Date();

  // Fetch initial status for tracing
  const initialEmail = await prisma.email.findUnique({ where: { id: emailId } });
  if (initialEmail) {
    console.log(
      `[DISPATCH-TRACE] DATABASE READ status=${initialEmail.status} scheduledAt=${initialEmail.scheduledAt.toISOString()} recipient=${initialEmail.toEmail}`,
    );
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

  console.log(`[DISPATCH-TRACE] CLAIM RESULT count=${claimed.count}`);

  if (claimed.count === 0) {
    return false;
  }

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return false;

  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    const error = new Error('Sender not found');
    console.error(`[DISPATCH-TRACE] FINAL FAILURE email=${emailId} stage=SENDER_LOOKUP error=${error.message}`);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: error.message },
    });
    return false;
  }

  let smtpResult: { messageId: string; previewUrl?: string } | null = null;

  try {
    console.log('[DISPATCH-TRACE] BEFORE SMTP');
    smtpResult = await sendMailWithEthereal({
      emailId,
      from: `${sender.displayName} <${sender.email}>`,
      to: email.toEmail,
      subject: email.subject,
      text: email.body,
    });
  } catch (error: any) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    const errorMsg = errObj.stack || errObj.message;
    console.error(`[DISPATCH-TRACE] FINAL FAILURE email=${emailId} stage=SMTP_DISPATCH error=${errorMsg}`);

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastError: errorMsg,
      },
    });
    return false;
  }

  // SMTP SUCCEEDED! If DB update encounters an issue, DO NOT mark as FAILED! Preserve messageId & previewUrl!
  try {
    console.log('[DISPATCH-TRACE] BEFORE SENT DATABASE UPDATE');
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
    console.log('[DISPATCH-TRACE] SENT DATABASE UPDATE SUCCESS');
    console.log(`[DISPATCH-TRACE] COMPLETE email=${emailId}`);
    return true;
  } catch (dbError: any) {
    const dbErrObj = dbError instanceof Error ? dbError : new Error(String(dbError));
    console.error(`[DISPATCH-TRACE] SENT DATABASE UPDATE ERROR error=${dbErrObj.message}`);

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
      console.log('[DISPATCH-TRACE] SENT DATABASE UPDATE SUCCESS (fallback)');
      console.log(`[DISPATCH-TRACE] COMPLETE email=${emailId}`);
      return true;
    } catch (fallbackErr: any) {
      console.error(`[DISPATCH-TRACE] FINAL FAILURE email=${emailId} stage=SENT_DB_UPDATE error=${dbErrObj.message}`);
      return false;
    }
  }
}
