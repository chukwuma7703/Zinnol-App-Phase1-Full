import dotenv from "dotenv";
import { Worker } from "bullmq";
import connectDB from "./config/db.js";
import { processAnnualResults } from "./jobs/annualResultProcessor.js";

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
};

// Performance configuration
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 5; // Process multiple jobs concurrently
const MAX_JOBS_PER_WORKER = parseInt(process.env.MAX_JOBS_PER_WORKER) || 100; // Limit jobs per worker to prevent memory issues

console.log(`Starting ${WORKER_CONCURRENCY} background workers...`);

// Connect to MongoDB
connectDB();

// Create multiple workers for better concurrency
const workers = [];

for (let i = 0; i < WORKER_CONCURRENCY; i++) {
  const worker = new Worker("annual-result-generation", processAnnualResults, {
    connection,
    concurrency: 2, // Each worker handles 2 jobs simultaneously
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 1000, // Per second
    },
  });

  worker.on("completed", (job) => {
    console.log(`Worker ${i + 1}: Job ${job.id} has completed!`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Worker ${i + 1}: Job ${job.id} has failed with ${err.message}`);
  });

  worker.on("active", (job) => {
    console.log(`Worker ${i + 1}: Processing job ${job.id} - ${job.data.classroomId}`);
  });

  workers.push(worker);
}

console.log(`✅ ${workers.length} background workers started successfully`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await Promise.all(workers.map(worker => worker.close()));
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down workers...');
  await Promise.all(workers.map(worker => worker.close()));
  process.exit(0);
});

