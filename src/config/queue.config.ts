import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
    removeOnComplete: true,
    removeOnFail: false,
  },
}));