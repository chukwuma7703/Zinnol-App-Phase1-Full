import { Queue, Worker, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';
import { getCacheManager } from './distributedCache.js';

/**
 * Distributed Job Queue Manager for Enterprise Scaling
 * Handles job distribution across multiple servers and Redis cluster
 */
class DistributedQueueManager {
    constructor(options = {}) {
        this.options = {
            redisCluster: options.redisCluster || [
                { host: process.env.REDIS_HOST_1 || 'redis-01', port: 6379 },
                { host: process.env.REDIS_HOST_2 || 'redis-02', port: 6379 },
                { host: process.env.REDIS_HOST_3 || 'redis-03', port: 6379 }
            ],
            concurrency: options.concurrency || 10,
            maxRetries: options.maxRetries || 3,
            serverId: options.serverId || `server-${Date.now()}`,
            ...options
        };

        this.connection = null;
        this.queues = new Map();
        this.workers = new Map();
        this.schedulers = new Map();
        this.cache = getCacheManager();

        this.init();
    }

    /**
     * Initialize Redis cluster connection
     */
    async init() {
        try {
            this.connection = new IORedis.Cluster(this.options.redisCluster, {
                redisOptions: {
                    password: process.env.REDIS_PASSWORD,
                    lazyConnect: true,
                    retryDelayOnFailover: 100,
                    maxRetriesPerRequest: 3,
                    connectTimeout: 5000,
                },
                clusterRetryDelay: 100,
                enableOfflineQueue: true,
                maxRedirections: 16,
            });

            this.connection.on('connect', () => {
                console.log(`✅ Queue manager connected to Redis cluster (${this.options.serverId})`);
            });

            this.connection.on('error', (err) => {
                console.error(`❌ Queue manager Redis error (${this.options.serverId}):`, err);
            });

        } catch (error) {
            console.error('❌ Failed to initialize queue manager:', error);
        }
    }

    /**
     * Create or get a queue
     */
    getQueue(name, options = {}) {
        if (!this.queues.has(name)) {
            const queueOptions = {
                connection: this.connection,
                defaultJobOptions: {
                    removeOnComplete: 100,    // Keep last 100 completed jobs
                    removeOnFail: 50,         // Keep last 50 failed jobs
                    attempts: this.options.maxRetries,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
                },
                ...options
            };

            this.queues.set(name, new Queue(name, queueOptions));

            // Create scheduler for the queue
            if (!this.schedulers.has(name)) {
                this.schedulers.set(name, new QueueScheduler(name, {
                    connection: this.connection
                }));
            }
        }

        return this.queues.get(name);
    }

    /**
     * Create or get a worker
     */
    getWorker(queueName, processor, options = {}) {
        const workerKey = `${queueName}-${this.options.serverId}`;

        if (!this.workers.has(workerKey)) {
            const workerOptions = {
                connection: this.connection,
                concurrency: this.options.concurrency,
                limiter: {
                    max: 50,        // Max 50 jobs
                    duration: 1000  // Per second
                },
                ...options
            };

            const worker = new Worker(queueName, processor, workerOptions);

            // Enhanced event handlers
            worker.on('completed', (job) => {
                console.log(`✅ Job ${job.id} completed on ${this.options.serverId} (${queueName})`);
                this.cache.set(`job:${job.id}:status`, 'completed', 3600);
            });

            worker.on('failed', (job, err) => {
                console.error(`❌ Job ${job.id} failed on ${this.options.serverId} (${queueName}):`, err.message);
                this.cache.set(`job:${job.id}:status`, 'failed', 3600);
                this.cache.set(`job:${job.id}:error`, err.message, 3600);
            });

            worker.on('active', (job) => {
                console.log(`🔄 Processing job ${job.id} on ${this.options.serverId} (${queueName})`);
                this.cache.set(`job:${job.id}:status`, 'active', 3600);
            });

            worker.on('stalled', (job) => {
                console.warn(`⚠️ Job ${job.id} stalled on ${this.options.serverId} (${queueName})`);
            });

            this.workers.set(workerKey, worker);
        }

        return this.workers.get(workerKey);
    }

    /**
     * Add job to queue with distributed processing
     */
    async addJob(queueName, jobName, data, options = {}) {
        const queue = this.getQueue(queueName);

        const jobOptions = {
            priority: 5,  // Default priority
            delay: 0,
            ...options,
            // Add server affinity for load balancing
            serverId: this.options.serverId,
            timestamp: Date.now()
        };

        const job = await queue.add(jobName, data, jobOptions);

        // Cache job metadata
        await this.cache.set(`job:${job.id}:metadata`, {
            queueName,
            jobName,
            serverId: this.options.serverId,
            createdAt: Date.now(),
            data: JSON.stringify(data).substring(0, 500) // Truncate large data
        }, 3600);

        console.log(`📋 Job ${job.id} queued on ${this.options.serverId} (${queueName}:${jobName})`);
        return job;
    }

    /**
     * Add bulk jobs for distributed processing
     */
    async addBulkJobs(queueName, jobs, options = {}) {
        const queue = this.getQueue(queueName);
        const { batchSize = 50, staggerDelay = 100 } = options;

        const jobPromises = [];
        let delay = 0;

        for (let i = 0; i < jobs.length; i += batchSize) {
            const batch = jobs.slice(i, i + batchSize);

            for (const job of batch) {
                const jobOptions = {
                    priority: 5,
                    delay,
                    serverId: this.options.serverId,
                    timestamp: Date.now(),
                    ...job.options
                };

                jobPromises.push(
                    queue.add(job.name, job.data, jobOptions)
                );

                delay += staggerDelay; // Stagger jobs to prevent overwhelming
            }
        }

        const queuedJobs = await Promise.all(jobPromises);

        // Cache batch metadata
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await this.cache.set(`batch:${batchId}`, {
            queueName,
            totalJobs: jobs.length,
            serverId: this.options.serverId,
            jobIds: queuedJobs.map(j => j.id),
            createdAt: Date.now()
        }, 3600);

        console.log(`📦 Bulk queued ${jobs.length} jobs in ${queueName} (${this.options.serverId})`);
        return { batchId, jobs: queuedJobs };
    }

    /**
     * Get job status
     */
    async getJobStatus(jobId) {
        const cached = await this.cache.get(`job:${jobId}:status`);
        if (cached) return cached;

        // Fallback to queue lookup
        for (const [name, queue] of this.queues) {
            try {
                const job = await queue.getJob(jobId);
                if (job) {
                    return await job.getState();
                }
            } catch (error) {
                // Continue to next queue
            }
        }

        return 'not_found';
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) return null;

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed(),
            queue.getDelayed()
        ]);

        return {
            queueName,
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
            total: waiting.length + active.length + completed.length + failed.length + delayed.length
        };
    }

    /**
     * Get all queue statistics
     */
    async getAllQueueStats() {
        const stats = {};

        for (const queueName of this.queues.keys()) {
            stats[queueName] = await this.getQueueStats(queueName);
        }

        return stats;
    }

    /**
     * Health check
     */
    async healthCheck() {
        const stats = await this.getAllQueueStats();
        const cacheHealth = await this.cache.healthCheck();

        let redisHealthy = false;
        if (this.connection) {
            try {
                await this.connection.ping();
                redisHealthy = true;
            } catch (error) {
                console.warn('Queue Redis health check failed:', error);
            }
        }

        return {
            healthy: redisHealthy && cacheHealth.healthy,
            redis: {
                connected: redisHealthy,
                cluster: true
            },
            cache: cacheHealth,
            queues: stats,
            serverId: this.options.serverId,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Graceful shutdown
     */
    async close() {
        console.log(`🛑 Shutting down queue manager (${this.options.serverId})...`);

        // Close all workers
        for (const [key, worker] of this.workers) {
            await worker.close();
            console.log(`  ✅ Worker ${key} closed`);
        }

        // Close all schedulers
        for (const [key, scheduler] of this.schedulers) {
            await scheduler.close();
            console.log(`  ✅ Scheduler ${key} closed`);
        }

        // Close Redis connection
        if (this.connection) {
            await this.connection.quit();
            console.log(`  ✅ Redis connection closed`);
        }

        this.workers.clear();
        this.queues.clear();
        this.schedulers.clear();
    }
}

// Export singleton instance per server
const queueManagers = new Map();

export const getQueueManager = (serverId, options = {}) => {
    if (!queueManagers.has(serverId)) {
        queueManagers.set(serverId, new DistributedQueueManager({
            serverId,
            ...options
        }));
    }
    return queueManagers.get(serverId);
};

export default DistributedQueueManager;
