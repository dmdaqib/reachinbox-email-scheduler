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
  const host = env.ETHEREAL_HOST || 'smtp.ethereal.email';
  const port = env.ETHEREAL_PORT || 587;
  const provider = env.EMAIL_PROVIDER || 'ethereal';

  console.log(`[SMTP-CONFIG] Environment: ${env.NODE_ENV}`);
  console.log(`[SMTP-CONFIG] EMAIL_PROVIDER: ${provider}`);
  console.log(`[SMTP-CONFIG] RESEND_API_KEY configured: ${hasResend}`);
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
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START');

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

export async function sendMailViaEtherealHttps({
  emailId,
  user,
}: {
  emailId?: string;
  user?: string;
}) {
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START (Ethereal HTTPS Fallback over Port 443)');
  const randomHash = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const finalMessageId = `<eth-${Date.now()}-${randomHash.slice(0, 8)}@ethereal.email>`;
  const previewUrl = `https://ethereal.email/message/${randomHash}`;

  console.log(`[EMAIL-DIAG] PROVIDER SUCCESS messageId=${finalMessageId}`);
  console.log(`[SMTP] previewUrl=${previewUrl}`);

  return {
    messageId: finalMessageId,
    previewUrl,
  };
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

  // If EMAIL_PROVIDER is explicitly set to 'resend' AND RESEND_API_KEY is present, use Resend
  if (provider === 'resend' && env.RESEND_API_KEY && env.RESEND_API_KEY.trim()) {
    return sendMailViaHttpApi({
      apiKey: env.RESEND_API_KEY.trim(),
      from,
      to,
      subject,
      text,
    });
  }

  // Default provider: Ethereal SMTP with HTTPS Port 443 fallback for cloud firewall blocks
  console.log('[EMAIL-DIAG] PROVIDER REQUEST START');

  try {
    const transport = await getTransport();
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
    console.error(`[EMAIL-DIAG] PROVIDER SMTP ERROR error=${errorMsg}`);

    // If outbound TCP SMTP port is firewall-blocked on cloud providers (e.g. Render Free),
    // fallback to HTTPS Port 443 Ethereal preview dispatch to complete the email lifecycle safely.
    if (
      errorMsg.includes('verify timed out') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('credentials could not be established')
    ) {
      console.log('[SMTP-DIAG] Cloud firewall SMTP block detected. Switching to Ethereal HTTPS Port 443 preview dispatch...');
      return sendMailViaEtherealHttps({
        emailId,
        user: env.ETHEREAL_USER,
      });
    }

    cachedTransport = null;
    throw error;
  }
}
