import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;

export function clearCachedTransport() {
  cachedTransport = null;
}

export async function createTestAccountWithTimeout(timeoutMs = 8000) {
  console.log('[SMTP-TRACE] createTestAccount START');
  const accountPromise = nodemailer.createTestAccount();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Ethereal createTestAccount timeout after 8s')), timeoutMs)
  );

  const account = await Promise.race([accountPromise, timeoutPromise]);
  console.log('[SMTP-TRACE] createTestAccount SUCCESS');
  return account;
}

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  console.log('[SMTP-TRACE] START transporter initialization');
  let user = env.ETHEREAL_USER;
  let pass = env.ETHEREAL_PASS;
  let host = env.ETHEREAL_HOST || 'smtp.ethereal.email';
  let port = env.ETHEREAL_PORT || 587;

  if (!user || !pass) {
    try {
      const testAccount = await createTestAccountWithTimeout(8000);
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      console.log(`[SMTP-TRACE] Auto-generated Ethereal test account: ${user}`);
    } catch (err) {
      console.warn('[SMTP-TRACE ERROR] Failed to create test account automatically:', err instanceof Error ? err.message : err);
    }
  }

  if (!user || !pass) {
    throw new Error('Ethereal SMTP credentials could not be established.');
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  console.log('[SMTP-TRACE] transporter initialized');
  return cachedTransport;
}

export async function sendMailWithEthereal({
  emailId,
  from,
  to,
  subject,
  text,
}: {
  emailId?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const logId = emailId || 'N/A';

  const dispatchOperation = async () => {
    const transport = await getTransport();
    console.log(`[SMTP-TRACE] START sendMail email=${logId}`);
    const result = (await transport.sendMail({
      from,
      to,
      subject,
      text,
    })) as {
      messageId?: string;
      response?: string;
      accepted?: string[];
    };

    const previewUrl = nodemailer.getTestMessageUrl(result as any);
    const finalMessageId = result.messageId || `msg-${Date.now()}`;
    const finalPreview = typeof previewUrl === 'string' ? previewUrl : undefined;

    console.log(`[SMTP-TRACE] sendMail SUCCESS email=${logId} messageId=${finalMessageId}`);
    if (finalPreview) {
      console.log(`[SMTP] previewUrl=${finalPreview}`);
    }

    return {
      messageId: finalMessageId,
      previewUrl: finalPreview,
    };
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`SMTP operation timed out after 15s for email=${logId}`)), 15000)
  );

  try {
    return await Promise.race([dispatchOperation(), timeoutPromise]);
  } catch (error: any) {
    const errorMsg = error instanceof Error ? (error.stack || error.message) : String(error);
    if (errorMsg.includes('timed out') || errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      console.error(`[SMTP-TRACE] SMTP TIMEOUT email=${logId}`);
    }
    console.error(`[SMTP-TRACE] SMTP ERROR email=${logId} error=${errorMsg}`);
    cachedTransport = null;
    throw error;
  }
}
