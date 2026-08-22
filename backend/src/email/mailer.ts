import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;
let cachedAccount: { user: string; pass: string; host: string; port: number } | null = null;

export function clearCachedTransport() {
  cachedTransport = null;
  cachedAccount = null;
}

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  let user = env.ETHEREAL_USER || cachedAccount?.user;
  let pass = env.ETHEREAL_PASS || cachedAccount?.pass;
  let host = env.ETHEREAL_HOST || cachedAccount?.host || 'smtp.ethereal.email';
  let port = env.ETHEREAL_PORT || cachedAccount?.port || 587;

  console.log(`[SMTP] Initializing transporter (host=${host}:${port}, userConfigured=${Boolean(user)})`);

  if (!user || !pass) {
    try {
      console.log('[SMTP] Attempting automatic Ethereal test account generation...');
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      cachedAccount = { user, pass, host, port };
      console.log(`[SMTP] Auto-generated Ethereal test account: ${user}`);
    } catch (err) {
      console.warn('[SMTP Error] Failed to create Ethereal test account automatically:', err instanceof Error ? err.message : err);
    }
  }

  if (!user || !pass) {
    throw new Error('Ethereal SMTP credentials could not be established. Please set ETHEREAL_USER and ETHEREAL_PASS environment variables in Render.');
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

  console.log(`[SMTP] Transporter ready for host ${host}:${port}`);
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
  console.log(`[SMTP] Dispatching email ID ${logId} to ${to} (Subject: "${subject}")`);
  const transport = await getTransport();
  try {
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

    console.log(`[SMTP] Successfully delivered email ID ${logId} to ${to} (MessageId: ${finalMessageId})`);
    if (finalPreview) {
      console.log(`[SMTP] Ethereal Preview URL: ${finalPreview}`);
    }

    return {
      messageId: finalMessageId,
      previewUrl: finalPreview,
    };
  } catch (error) {
    console.error(`[SMTP Error] Failed to send email ID ${logId} to ${to}:`, error instanceof Error ? error.message : error);
    cachedTransport = null;
    throw error;
  }
}
