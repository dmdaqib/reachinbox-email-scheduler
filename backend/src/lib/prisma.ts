import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

if (!process.env.DATABASE_URL && env.DATABASE_URL) {
  process.env.DATABASE_URL = env.DATABASE_URL;
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});
