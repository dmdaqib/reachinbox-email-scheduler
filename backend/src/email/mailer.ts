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
  const hasUser = Boolean(env.ETHEREAL_USER && env.ETHEREAL_USER.trim());
  const hasPass = Boolean(env.ETHEREAL_PASS && env.ETHEREAL_PASS.trim());
  const hasResend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const hasBrevo = Boolean(env.BREVO_API_KEY && env.BREVO_API_KEY.trim());
  const host = env.ETHEREAL_HOST || 'smtp.ethereal.email';
  const port = env.ETHEREAL_PORT || 587;
  const provider = env.EMAIL_PROVIDER || 'ethereal';

  console.log(`[SMTP-CONFIG] Environment: ${env.NODE_ENV}`);
  console.log(`[SMTP-CONFIG] EMAIL_PROVIDER: ${provider}`);
  console.log(`[SMTP-CONFIG] RESEND_API_KEY configured: ${hasResend}`);
  console.log(`[SMTP-CONFIG] BREVO_API_KEY configured: ${hasBrevo}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_USER configured: ${hasUser}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_PASS configured: ${hasPass}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_HOST: ${host}`);
  console.log(`[SMTP-CONFIG] ETHEREAL_PORT: ${port}`);
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
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START (Resend REST API over HTTPS Port 443)');

  // Use Resend's free onboarding domain when custom domain is unverified
  const formattedFrom = 'ReachInbox Scheduler <onboarding@resend.dev>';

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

    const messageId = data.id || `re_${Date.now()}`;
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

export async function sendMailViaBrevoApi({
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
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START (Brevo REST API over HTTPS Port 443)');

  const senderName = from.includes('<') ? from.split('<')[0].trim() : 'ReachInbox Scheduler';
  const senderEmail = from.includes('<') ? from.split('<')[1].replace('>', '').trim() : from;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    const data = (await response.json()) as { messageId?: string; message?: string; code?: string };

    if (!response.ok) {
      const safeErrorMsg = data.message || data.code || `HTTP ${response.status}`;
      console.error(`[EMAIL-DIAG] PROVIDER ERROR status=${response.status} message=${safeErrorMsg}`);
      throw new Error(`Brevo HTTPS API Error (${response.status}): ${safeErrorMsg}`);
    }

    const messageId = data.messageId || `bv_${Date.now()}`;
    console.log(`[EMAIL-DIAG] PROVIDER SUCCESS messageId=${messageId}`);

    return {
      messageId,
      previewUrl: undefined,
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
  const provider = (env.EMAIL_PROVIDER || 'ethereal').toLowerCase();
  const isProd = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

  // 1. Resend REST API over HTTPS Port 443
  if (provider === 'resend' || (isProd && env.RESEND_API_KEY && provider !== 'brevo')) {
    if (!env.RESEND_API_KEY || !env.RESEND_API_KEY.trim()) {
      throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY environment variable in Render.');
    }
    return sendMailViaResendApi({
      apiKey: env.RESEND_API_KEY.trim(),
      from,
      to,
      subject,
      text,
    });
  }

  // 2. Brevo REST API over HTTPS Port 443
  if (provider === 'brevo') {
    if (!env.BREVO_API_KEY || !env.BREVO_API_KEY.trim()) {
      throw new Error('EMAIL_PROVIDER=brevo requires BREVO_API_KEY environment variable in Render.');
    }
    return sendMailViaBrevoApi({
      apiKey: env.BREVO_API_KEY.trim(),
      from,
      to,
      subject,
      text,
    });
  }

  // 3. Ethereal SMTP (For Local Development & Non-Blocked Environments)
  if (isProd && provider === 'ethereal' && !env.RESEND_API_KEY && !env.BREVO_API_KEY) {
    console.error(
      '[CONFIG ERROR] Render Free Web Services block outbound SMTP ports 25, 465, and 587. To send emails from Render production over HTTPS Port 443, configure EMAIL_PROVIDER=resend and RESEND_API_KEY in Render Environment Variables.',
    );
  }

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
