import { config } from 'dotenv';
import { z } from 'zod';

config();

const optionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  BACKEND_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(8).default('reachinbox-session-secret-change-me'),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/reachinbox?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().min(1).default(100),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  ETHEREAL_HOST: optionalString,
  ETHEREAL_PORT: z.coerce.number().int().min(1).default(587),
  ETHEREAL_USER: optionalString,
  ETHEREAL_PASS: optionalString,
  DEFAULT_SENDER_EMAIL: optionalString,
  DEFAULT_SENDER_NAME: optionalString,
});

export const env = envSchema.parse(process.env);
