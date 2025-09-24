import { Queue } from "bullmq";

// Connection options can be configured via environment variables for production
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
};

export const annualResultQueue = new Queue("annual-result-generation", { connection });


