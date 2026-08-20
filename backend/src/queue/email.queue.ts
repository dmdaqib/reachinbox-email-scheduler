import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const queue = new Queue('email-send', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});

