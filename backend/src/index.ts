import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { reconcileStaleJobs } from './services/reconcile.service.js';
import './worker.js';

const app = createApp();

app.listen(env.PORT, async () => {
  console.log(`Backend running on http://localhost:${env.PORT}`);
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL');
    await reconcileStaleJobs().catch((err) => console.error('Startup reconciliation error:', err));
  } catch (error) {
    console.error('PostgreSQL connection failed', error);
  }
});

