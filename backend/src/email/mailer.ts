import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

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

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  console.log(`[SMTP] Transporter initialized for host ${host}:${port}`);
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
  console.log(`[SMTP] Dispatching email to ${to} (Subject: "${subject}")`);
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

    console.log(`[SMTP] Successfully delivered email to ${to} (MessageId: ${finalMessageId})`);
    if (finalPreview) {
      console.log(`[SMTP] Ethereal Preview URL: ${finalPreview}`);
    }

    return {
      messageId: finalMessageId,
      previewUrl: finalPreview,
    };
  } catch (error) {
    console.error(`[SMTP Error] Failed to send email to ${to}:`, error instanceof Error ? error.message : error);
    cachedTransport = null;
    throw error;
  }
}
