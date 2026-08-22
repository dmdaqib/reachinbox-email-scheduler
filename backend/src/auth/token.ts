import crypto from 'crypto';
import { env } from '../config/env.js';

export function generateAuthToken(userId: string): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${signature}`;
}

export function verifyAuthToken(token: string): { userId: string } | null {
  try {
    const [base64Payload, signature] = token.split('.');
    if (!base64Payload || !signature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', env.SESSION_SECRET)
      .update(base64Payload)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) return null;

    return { userId: payload.userId };
  } catch {
    return null;
  }
}
