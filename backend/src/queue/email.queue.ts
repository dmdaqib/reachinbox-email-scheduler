import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const queue = new Queue('email-send', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
});

