import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { startDispatcher } from './services/dispatcher.js';

if (!process.env.DATABASE_URL) {
  console.error('[CONFIG ERROR] Missing required production environment variable: DATABASE_URL');
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
