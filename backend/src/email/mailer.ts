import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  console.log('[SMTP] transporter initialization started');
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
      console.log(`[SMTP] Auto-generated Ethereal test account: ${user}`);
    } catch (err) {
      console.warn('[SMTP Error] Failed to create test account automatically:', err);
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
    tls: {
      rejectUnauthorized: false,
    },
  });

  console.log('[SMTP] transporter initialized');
  return cachedTransport;
}

export async function sendMailWithEthereal({
  from,
  to,
  subject,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const transport = await getTransport();
  console.log('[SMTP] sendMail started');
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

    console.log(`[SMTP] sendMail SUCCESS messageId=${finalMessageId}`);
    if (finalPreview) {
      console.log(`[SMTP] previewUrl=${finalPreview}`);
    }

    return {
      messageId: finalMessageId,
      previewUrl: finalPreview,
    };
  } catch (error) {
    console.error(`[SMTP Error] sendMail failed for ${to}:`, error instanceof Error ? (error.stack || error.message) : error);
    cachedTransport = null;
    throw error;
  }
}
