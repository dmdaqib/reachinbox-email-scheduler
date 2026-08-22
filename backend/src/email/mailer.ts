import nodemailer from 'nodemailer';
import dns from 'dns';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;
let cachedAccount: { user: string; pass: string; host: string; port: number } | null = null;

export function clearCachedTransport() {
  cachedTransport = null;
  cachedAccount = null;
}

export function printSmtpStartupConfig() {
  const isProd = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  const hasResend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const hasUser = Boolean(env.ETHEREAL_USER && env.ETHEREAL_USER.trim());
  const hasPass = Boolean(env.ETHEREAL_PASS && env.ETHEREAL_PASS.trim());

  console.log(`[SMTP-CONFIG] Environment: ${env.NODE_ENV}`);
  console.log(`[SMTP-CONFIG] RESEND_API_KEY configured: ${hasResend}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_USER configured: ${hasUser}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_PASS configured: ${hasPass}`);

  if (isProd && (!env.RESEND_API_KEY || !env.RESEND_API_KEY.trim())) {
    console.error(
      '[CONFIG ERROR] Missing required production environment variable: RESEND_API_KEY. Production email dispatch requires RESEND_API_KEY for HTTPS Port 443 sending.',
    );
  }
}

export async function checkSmtpConnectivity(host: string) {
  console.log(`[SMTP-DIAG] DNS lookup START for ${host}`);
  try {
    const lookup = await dns.promises.lookup(host);
    console.log(`[SMTP-DIAG] DNS SUCCESS ip=${lookup.address}`);
    return lookup.address;
  } catch (dnsErr: any) {
    const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
    console.error(`[SMTP-DIAG] DNS FAILED error=${msg}`);
    return null;
  }
}

export async function sendMailViaResendApi({
  emailId,
  apiKey,
  from,
  to,
  subject,
  text,
}: {
  emailId?: string;
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START (Resend REST API)');

  const formattedFrom = 'ReachInbox Scheduler <onboarding@resend.dev>';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (emailId) {
    headers['Idempotency-Key'] = emailId;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: formattedFrom,
        to: [to],
        subject,
        text,
      }),
    });

    const data = (await response.json()) as { id?: string; message?: string; name?: string; statusCode?: number };

    console.log(`[EMAIL-DIAG] Resend HTTP Status: ${response.status}`);
    console.log(`[EMAIL-DIAG] Resend Response: ${JSON.stringify(data)}`);

    if (!response.ok) {
      const safeErrorMsg = data.message || data.name || `HTTP ${response.status}`;
      console.error(`[EMAIL-DIAG] PROVIDER ERROR status=${response.status} message=${safeErrorMsg}`);
      throw new Error(`Resend REST API Error (${response.status}): ${safeErrorMsg}`);
    }

    if (!data.id) {
      throw new Error(`Resend REST API returned HTTP ${response.status} but no message ID was returned.`);
    }

    const messageId = data.id;
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

  await checkSmtpConnectivity(host);

  if (!user || !pass) {
    if (isProd) {
      throw new Error(
        'Ethereal SMTP credentials could not be established. Please set ETHEREAL_USER and ETHEREAL_PASS environment variables in Render.',
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
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
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
  const isProd = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

  // In production (NODE_ENV=production), use Resend REST API exclusively over HTTPS Port 443.
  // NEVER run Nodemailer SMTP or transporter.verify() in production.
  if (isProd) {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        'Missing RESEND_API_KEY environment variable in Render. Production email dispatch requires RESEND_API_KEY for HTTPS Port 443 sending.',
      );
    }

    return sendMailViaResendApi({
      emailId,
      apiKey: apiKey.trim(),
      from,
      to,
      subject,
      text,
    });
  }

  // Local Development (NODE_ENV !== 'production'): Use Nodemailer Ethereal SMTP
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START (Ethereal SMTP)');
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

    console.log(`[EMAIL-DIAG] PROVIDER SUCCESS messageId=${finalMessageId}`);
    if (finalPreview) {
      console.log(`[SMTP] previewUrl=${finalPreview}`);
    }

    return {
      messageId: finalMessageId,
      previewUrl: finalPreview,
    };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[EMAIL-DIAG] PROVIDER ERROR error=${errorMsg}`);
    cachedTransport = null;
    throw error;
  }
}
