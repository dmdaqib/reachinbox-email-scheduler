import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  console.log('[SMTP-TRACE] START transporter initialization');
  let user = env.ETHEREAL_USER;
  let pass = env.ETHEREAL_PASS;
  let host = env.ETHEREAL_HOST || 'smtp.ethereal.email';
  let port = env.ETHEREAL_PORT || 587;

  if (!user || !pass) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      console.log(`[SMTP-TRACE] Auto-generated Ethereal test account: ${user}`);
    } catch (err) {
      console.warn('[SMTP-TRACE ERROR] Failed to create test account automatically:', err);
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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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
  console.log(`[SMTP-TRACE] START sendMail email=${logId}`);
  const transport = await getTransport();

  try {
    const sendPromise = transport.sendMail({
      from,
      to,
      subject,
      text,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SMTP sendMail 20s timeout exceeded')), 20000),
    );

    const result = (await Promise.race([sendPromise, timeoutPromise])) as {
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
  } catch (error: any) {
    const errorMsg = error instanceof Error ? (error.stack || error.message) : String(error);
    if (errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      console.error(`[SMTP-TRACE] sendMail TIMEOUT email=${logId}`);
    }
    console.error(`[SMTP-TRACE] sendMail ERROR email=${logId} error=${errorMsg}`);
    cachedTransport = null;
    throw error;
  }
}
