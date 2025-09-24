/**
 * AI Coaching Queue Processor
 * Handles asynchronous processing of teaching feedback analysis
 */

import { Queue, Worker } from 'bullmq';
import aiCoach from '../services/aiPedagogicalCoach.js';
import logger from '../utils/logger.js';
import { getRedisClient } from '../config/cache.js';

// Create queue and worker only in non-test environments
let coachingQueue = null;
let coachingWorker = null;

const initializeQueue = () => {
  const redisClient = getRedisClient();
  
  if (!redisClient) {
    logger.warn('Redis client not available, coaching queue disabled');
    return;
  }

  // Create queue
  coachingQueue = new Queue('ai-coaching', {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });

  // Create worker to process jobs
  coachingWorker = new Worker(
    'ai-coaching',
    async (job) => {
      const { activityId, priority } = job.data;

      logger.info(`Processing AI coaching job for activity ${activityId}`);

      try {
        // Process with AI coach
        const feedback = await aiCoach.analyzeFeedbackNote(activityId);

        logger.info(`AI coaching completed for activity ${activityId}`);

        return {
          success: true,
          activityId,
          feedbackId: feedback.sessionId,
          score: feedback.summary.overallScore,
          processedAt: new Date()
        };

      } catch (error) {
        logger.error(`AI coaching failed for activity ${activityId}:`, error);
        throw error;
      }
    },
    {
      connection: getRedisClient(),
      concurrency: 5, // Process up to 5 jobs simultaneously
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute (to respect AI API rate limits)
      },
    }
  );

  coachingWorker.on('stalled', (jobId) => {
    logger.warn(`Coaching job ${jobId} stalled`);
  });

  // Queue monitoring
  coachingQueue.on('waiting', (job) => {
    logger.debug(`Coaching job ${job.id} waiting`);
  });

  coachingQueue.on('error', (error) => {
    logger.error('Coaching queue error:', error);
  });

  logger.info('AI Coaching queue and worker initialized successfully');
};

// Initialize queue after Redis is ready (called from server.js)
if (process.env.NODE_ENV !== 'test') {
  // Delay initialization to ensure Redis is connected
  setTimeout(initializeQueue, 2000);
}

// Export initialization function for manual setup
export { initializeQueue };

/**
 * Queue coaching analysis for a teaching activity
 */
export const queueCoachingAnalysis = async (activityId, priority = 'normal') => {
  if (!coachingQueue) {
    logger.warn('Coaching queue not available (test environment or Redis not connected)');
    return null;
  }

  try {
    const job = await coachingQueue.add(
      'analyze-feedback',
      { activityId, priority },
      {
        priority: priority === 'high' ? 10 : 5,
        delay: priority === 'high' ? 0 : 5000, // High priority immediate, normal 5s delay
      }
    );

    logger.info(`Queued AI coaching analysis for activity ${activityId} with priority ${priority}`);
    return job.id;
  } catch (error) {
    logger.error('Failed to queue coaching analysis:', error);
    throw error;
  }
};

/**
 * Get queue statistics
 */
export const getQueueStats = async () => {
  if (!coachingQueue) {
    return { status: 'unavailable', message: 'Queue not initialized (test environment)' };
  }

  try {
    const waiting = await coachingQueue.getWaiting();
    const active = await coachingQueue.getActive();
    const completed = await coachingQueue.getCompleted();
    const failed = await coachingQueue.getFailed();
    const delayed = await coachingQueue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      isPaused: coachingQueue.isPaused ? await coachingQueue.isPaused() : false,
    };
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    return { error: error.message };
  }
};

/**
 * Pause the queue
 */
export const pauseQueue = async () => {
  if (!coachingQueue) {
    logger.warn('Cannot pause queue: not initialized');
    return false;
  }

  try {
    await coachingQueue.pause();
    logger.info('Coaching queue paused');
    return true;
  } catch (error) {
    logger.error('Failed to pause queue:', error);
    return false;
  }
};

/**
 * Resume the queue
 */
export const resumeQueue = async () => {
  if (!coachingQueue) {
    logger.warn('Cannot resume queue: not initialized');
    return false;
  }

  try {
    await coachingQueue.resume();
    logger.info('Coaching queue resumed');
    return true;
  } catch (error) {
    logger.error('Failed to resume queue:', error);
    return false;
  }
};

/**
 * Clean old jobs from queue
 */
export const cleanQueue = async (grace = 24 * 3600 * 1000) => {
  if (!coachingQueue) {
    logger.warn('Cannot clean queue: not initialized');
    return 0;
  }

  try {
    const cleaned = await coachingQueue.clean(grace, 100, 'completed');
    logger.info(`Cleaned ${cleaned.length} old completed jobs from coaching queue`);
    return cleaned.length;
  } catch (error) {
    logger.error('Failed to clean queue:', error);
    return 0;
  }
};

/**
 * Retry failed jobs
 */
export const retryFailedJobs = async () => {
  if (!coachingQueue) {
    logger.warn('Cannot retry jobs: queue not initialized');
    return 0;
  }

  try {
    const failedJobs = await coachingQueue.getFailed();
    let retried = 0;

    for (const job of failedJobs) {
      if (job.opts.attempts && job.attemptsMade < job.opts.attempts) {
        await job.retry();
        retried++;
      }
    }

    logger.info(`Retried ${retried} failed coaching jobs`);
    return retried;
  } catch (error) {
    logger.error('Failed to retry jobs:', error);
    return 0;
  }
};

/**
 * Get job by ID
 */
export const getJob = async (jobId) => {
  if (!coachingQueue) {
    return null;
  }
  return await coachingQueue.getJob(jobId);
};

/**
 * Cancel a job
 */
export const cancelJob = async (jobId) => {
  if (!coachingQueue) {
    return false;
  }

  const job = await coachingQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Coaching job ${jobId} cancelled`);
    return true;
  }
  return false;
};

export { coachingQueue, coachingWorker };

export default {
  queue: coachingQueue,
  worker: coachingWorker,
  queueCoachingAnalysis,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  retryFailedJobs,
  getJob,
  cancelJob
};