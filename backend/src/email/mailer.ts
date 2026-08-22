import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;
let cachedAccount: { user: string; pass: string; host: string; port: number } | null = null;

export function clearCachedTransport() {
  cachedTransport = null;
  cachedAccount = null;
}

export function printSmtpStartupConfig() {
  const hasUser = Boolean(env.ETHEREAL_USER && env.ETHEREAL_USER.trim());
  const hasPass = Boolean(env.ETHEREAL_PASS && env.ETHEREAL_PASS.trim());
  const hasResend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const host = env.ETHEREAL_HOST || 'smtp.ethereal.email';
  const port = env.ETHEREAL_PORT || 587;

  console.log(`[SMTP-CONFIG] Environment: ${env.NODE_ENV}`);
  console.log(`[SMTP-CONFIG] RESEND_API_KEY configured: ${hasResend}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_USER configured: ${hasUser}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_PASS configured: ${hasPass}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_HOST: ${host}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_PORT: ${port}`);
}

export async function sendMailViaHttpApi({
  apiKey,
  from,
  to,
  subject,
  text,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START (Resend HTTPS API over Port 443)');

  // Format sender address cleanly for Resend
  const formattedFrom = from.includes('<')
    ? from
    : `ReachInbox Scheduler <onboarding@resend.dev>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formattedFrom,
        to: [to],
        subject,
        text,
      }),
    });

    const data = (await response.json()) as { id?: string; message?: string; name?: string; statusCode?: number };

    if (!response.ok) {
      const safeErrorMsg = data.message || data.name || `HTTP ${response.status}`;
      console.error(`[EMAIL-DIAG] PROVIDER ERROR status=${response.status} message=${safeErrorMsg}`);
      throw new Error(`Resend HTTPS API Error (${response.status}): ${safeErrorMsg}`);
    }

    const messageId = data.id || `msg-${Date.now()}`;
    console.log(`[EMAIL-DIAG] PROVIDER SUCCESS messageId=${messageId}`);

    return {
      messageId,
      previewUrl: `https://resend.com/emails/${messageId}`,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[EMAIL-DIAG] PROVIDER ERROR message=${errorMsg}`);
    throw err;
  }
}

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  const isProd = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  let user = env.ETHEREAL_USER || cachedAccount?.user;
  let pass = env.ETHEREAL_PASS || cachedAccount?.pass;
  let host = env.ETHEREAL_HOST || cachedAccount?.host || 'smtp.ethereal.email';
  let port = env.ETHEREAL_PORT || cachedAccount?.port || 587;

  console.log(`[SMTP-DIAG] host=${host}`);
  console.log(`[SMTP-DIAG] port=${port}`);
  console.log(`[SMTP-DIAG] environment=${env.NODE_ENV}`);

  if (!user || !pass) {
    if (isProd) {
      console.warn(
        '[CONFIG WARNING] Render Free Web Services block outbound SMTP ports 25, 465, and 587. To send emails from Render production over port 443, configure RESEND_API_KEY in Render Environment Variables.',
      );
      throw new Error(
        'Ethereal SMTP credentials could not be established. Please set RESEND_API_KEY (for HTTPS port 443 dispatch) or ETHEREAL_USER and ETHEREAL_PASS in Render Environment Variables.',
      );
    }

    try {
      console.log('[SMTP-TRACE] Local development fallback: Attempting automatic Ethereal test account generation...');
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      cachedAccount = { user, pass, host, port };
      console.log(`[SMTP-TRACE] Auto-generated local Ethereal test account: ${user}`);
    } catch (err) {
      console.warn('[SMTP Error] Failed to create local Ethereal test account automatically:', err instanceof Error ? err.message : err);
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

  console.log('[SMTP-DIAG] transporter.verify START');
  try {
    const transportToVerify = cachedTransport;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SMTP transporter verify timed out after 8s')), 8000);
      transportToVerify.verify((err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('[SMTP-DIAG] transporter.verify SUCCESS');
  } catch (verifyErr: any) {
    const sanitizedMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
    const code = verifyErr?.code || 'N/A';
    const command = verifyErr?.command || 'N/A';
    console.error('[SMTP-DIAG] transporter.verify FAILED');
    console.error(`[SMTP-DIAG] error=${sanitizedMsg}`);
    console.error(`[SMTP-DIAG] code=${code}`);
    console.error(`[SMTP-DIAG] command=${command}`);
    cachedTransport = null;
    throw verifyErr;
  }

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

  // If RESEND_API_KEY is configured, send via Resend HTTPS API over Port 443
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.trim()) {
    return sendMailViaHttpApi({
      apiKey: env.RESEND_API_KEY.trim(),
      from,
      to,
      subject,
      text,
    });
  }

  // Otherwise, use Nodemailer SMTP
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
    console.error(`[SMTP] sendMail ERROR error=${error instanceof Error ? error.message : String(error)}`);
    cachedTransport = null;
    throw error;
  }
}
