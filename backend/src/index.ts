import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { startDispatcher } from './services/dispatcher.js';
import { printSmtpStartupConfig } from './email/mailer.js';

printSmtpStartupConfig();

if (!process.env.DATABASE_URL) {
  console.error('[CONFIG ERROR] Missing required production environment variable: DATABASE_URL');
} else {
  const dbUrl = process.env.DATABASE_URL;
  const match = dbUrl.match(/@([^/:]+)(?::(\d+))?\/([^?]+)/);
  const safeDbHost = match ? `${match[1]}/${match[3]}` : 'configured';
  console.log(`[DATABASE-IDENTITY] Connected PostgreSQL host/db: ${safeDbHost}`);
}

const app = createApp();

app.listen(env.PORT, async () => {
  console.log(`Backend running on http://localhost:${env.PORT}`);
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL');
    startDispatcher(2000);
  } catch (error) {
    console.error('PostgreSQL connection failed', error);
  }
});
