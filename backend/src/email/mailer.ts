import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransport: nodemailer.Transporter | null = null;
let cachedTestAccount: { user: string; pass: string; host: string; port: number } | null = null;

export function clearCachedTransport() {
  cachedTransport = null;
  cachedTestAccount = null;
}

export async function createTestAccountWithTimeout(timeoutMs = 8000) {
  console.log('[SMTP-TRACE] BEFORE ACCOUNT CREATION');
  const accountPromise = nodemailer.createTestAccount();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Ethereal createTestAccount timeout after 8s')), timeoutMs),
  );

  const account = await Promise.race([accountPromise, timeoutPromise]);
  console.log('[SMTP-TRACE] CREATE TEST ACCOUNT SUCCESS');
  return account;
}

export async function getTransport() {
  if (cachedTransport) return cachedTransport;

  console.log('[SMTP-TRACE] START transporter initialization');

  let user = env.ETHEREAL_USER || cachedTestAccount?.user;
  let pass = env.ETHEREAL_PASS || cachedTestAccount?.pass;
  let host = env.ETHEREAL_HOST || cachedTestAccount?.host || 'smtp.ethereal.email';
  let port = env.ETHEREAL_PORT || cachedTestAccount?.port || 587;

  console.log(
    `[SMTP-TRACE] SMTP CONFIG host=${host} port=${port} secure=${port === 465} userConfigured=${Boolean(
      env.ETHEREAL_USER,
    )} passConfigured=${Boolean(env.ETHEREAL_PASS)}`,
  );

  if (!user || !pass) {
    try {
      const testAccount = await createTestAccountWithTimeout(8000);
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      cachedTestAccount = { user, pass, host, port };
    } catch (err: any) {
      const sanitizedError = err instanceof Error ? err.message : String(err);
      console.error(`[SMTP-TRACE] CREATE TEST ACCOUNT ERROR error=${sanitizedError}`);
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

  console.log('[SMTP-TRACE] TRANSPORTER INITIALIZED');
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
    console.log(`[SMTP-TRACE] BEFORE SENDMAIL email=${logId}`);
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

    console.log(`[SMTP-TRACE] SENDMAIL SUCCESS messageId=${finalMessageId}`);
    if (finalPreview) {
      console.log(`[SMTP] previewUrl=${finalPreview}`);
    }

    return {
      messageId: finalMessageId,
      previewUrl: finalPreview,
    };
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`SMTP operation timed out after 15s for email=${logId}`)), 15000),
  );

  try {
    return await Promise.race([dispatchOperation(), timeoutPromise]);
  } catch (error: any) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    const errorMsg = errObj.message || String(error);
    const errorName = errObj.name || 'Error';
    const errorCode = (errObj as any).code || 'N/A';
    const errorStack = errObj.stack || errorMsg;

    if (errorMsg.includes('timed out') || errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      console.error(`[SMTP-TRACE] SMTP TIMEOUT email=${logId}`);
    }
    console.error(
      `[SMTP-TRACE] SENDMAIL ERROR name=${errorName} code=${errorCode} message=${errorMsg} stack=${errorStack}`,
    );
    cachedTransport = null;
    throw error;
  }
}
