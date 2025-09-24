import { getQueueManager } from '../config/distributedQueue.js';
import { getCacheManager } from '../config/distributedCache.js';
import { bulkUpdateOrCreateResults } from './resultService.js';
import StudentExam from '../models/StudentExam.js';
import Exam from '../models/Exam.js';
import Student from '../models/Student.js';

/**
 * Enterprise Bulk Processing Service
 * Handles distributed bulk operations for 50K-100K students
 */
class EnterpriseBulkProcessor {
    constructor(serverId = `server-${Date.now()}`) {
        this.serverId = serverId;
        this.queueManager = getQueueManager(serverId);
        this.cache = getCacheManager();

        // Initialize queues and workers
        this.initQueues();
    }

    /**
     * Initialize distributed queues and workers
     */
    initQueues() {
        // Bulk processing queue
        this.bulkQueue = this.queueManager.getQueue('bulk-processing', {
            defaultJobOptions: {
                priority: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 }
            }
        });

        // Result aggregation queue
        this.aggregationQueue = this.queueManager.getQueue('result-aggregation', {
            defaultJobOptions: {
                priority: 5,
                attempts: 2,
                backoff: { type: 'fixed', delay: 10000 }
            }
        });

        // Notification queue
        this.notificationQueue = this.queueManager.getQueue('notifications', {
            defaultJobOptions: {
                priority: 1,
                attempts: 5,
                backoff: { type: 'exponential', delay: 30000 }
            }
        });

        // Register workers
        this.registerWorkers();
    }

    /**
     * Register job processors
     */
    registerWorkers() {
        // Bulk publish chunk processor
        this.queueManager.getWorker('bulk-processing', this.processBulkPublishChunk.bind(this), {
            concurrency: 5
        });

        // Result aggregation processor
        this.queueManager.getWorker('result-aggregation', this.processResultAggregation.bind(this), {
            concurrency: 3
        });

        // Notification processor
        this.queueManager.getWorker('notifications', this.processNotification.bind(this), {
            concurrency: 10
        });
    }

    /**
     * Distributed bulk publish for enterprise scale
     */
    async distributedBulkPublish(examId, options = {}) {
        const {
            chunkSize = 500,        // Process 500 submissions per chunk
            maxConcurrency = 20,    // Allow 20 concurrent chunks
            staggerDelay = 200,     // 200ms delay between chunks
            progressCallback
        } = options;

        console.log(`🚀 Starting enterprise bulk publish for exam ${examId}`);
        console.log(`📊 Configuration: chunkSize=${chunkSize}, concurrency=${maxConcurrency}`);

        // Get exam details
        const exam = await Exam.findById(examId).populate('subject classroom');
        if (!exam) {
            throw new Error('Exam not found');
        }

        // Get all marked submissions
        const submissions = await StudentExam.find({
            exam: examId,
            status: 'marked',
            isPublished: false
        }).select('_id student totalScore');

        if (submissions.length === 0) {
            return { message: 'No submissions to publish', totalSubmissions: 0 };
        }

        console.log(`📋 Found ${submissions.length} submissions to process`);

        // Pre-warm cache for this exam
        await this.warmCacheForExam(examId, exam);

        // Split into chunks for distributed processing
        const chunks = this.chunkArray(submissions, chunkSize);
        const totalChunks = chunks.length;

        console.log(`📦 Split into ${totalChunks} chunks of ${chunkSize} submissions each`);

        // Create processing jobs with controlled concurrency
        const jobPromises = [];
        let delay = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkData = {
                examId,
                examData: {
                    session: exam.session,
                    term: exam.term,
                    subject: exam.subject._id,
                    classroom: exam.classroom._id,
                    totalMarks: exam.totalMarks
                },
                submissions: chunk.map(s => ({
                    id: s._id,
                    studentId: s.student,
                    totalScore: s.totalScore
                })),
                chunkIndex: i,
                totalChunks,
                serverId: this.serverId
            };

            jobPromises.push(
                this.queueManager.addJob('bulk-processing', 'bulk-publish-chunk', chunkData, {
                    priority: 10 - Math.floor(i / maxConcurrency), // Higher priority for first chunks
                    delay,
                    jobId: `bulk-publish-${examId}-chunk-${i}`
                })
            );

            delay += staggerDelay;
        }

        // Wait for all jobs to be queued
        const queuedJobs = await Promise.all(jobPromises);

        // Create aggregation job to monitor completion
        const aggregationJob = await this.queueManager.addJob('result-aggregation', 'bulk-publish-aggregation', {
            examId,
            totalChunks,
            jobIds: queuedJobs.map(j => j.id),
            serverId: this.serverId
        }, {
            priority: 15,
            delay: Math.max(30000, delay + 10000) // Start after chunks are queued
        });

        const estimatedTime = Math.ceil(totalChunks / maxConcurrency) * 45; // ~45s per chunk

        console.log(`✅ Enterprise bulk publish initiated:`);
        console.log(`   - ${totalChunks} processing chunks queued`);
        console.log(`   - ${queuedJobs.length} jobs distributed`);
        console.log(`   - Estimated completion: ${Math.ceil(estimatedTime / 60)} minutes`);

        return {
            success: true,
            examId,
            totalSubmissions: submissions.length,
            totalChunks,
            queuedJobs: queuedJobs.length,
            aggregationJobId: aggregationJob.id,
            estimatedTimeMinutes: Math.ceil(estimatedTime / 60),
            progressUrl: `/api/exams/${examId}/bulk-publish/progress`,
            serverId: this.serverId
        };
    }

    /**
     * Process a chunk of bulk publish operations
     */
    async processBulkPublishChunk(job) {
        const { examId, examData, submissions, chunkIndex, totalChunks, serverId } = job.data;

        console.log(`🔄 Processing chunk ${chunkIndex + 1}/${totalChunks} on ${serverId} (${submissions.length} submissions)`);

        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        try {
            // Prepare result updates for bulk operation
            const resultUpdates = submissions.map(submission => ({
                studentId: submission.studentId,
                schoolId: examData.schoolId, // Will be fetched from cache
                classroomId: examData.classroom,
                academicSession: examData.session,
                term: examData.term,
                subjectId: examData.subject,
                score: submission.totalScore,
                maxScore: examData.totalMarks,
                userId: job.data.userId || 'system'
            }));

            // Execute bulk result update
            const bulkResult = await bulkUpdateOrCreateResults(resultUpdates);

            successCount = bulkResult.modifiedCount + bulkResult.upsertedCount;
            errorCount = bulkResult.errors.length;

            // Mark submissions as published
            if (successCount > 0) {
                const successfulIds = submissions
                    .slice(0, successCount)
                    .map(s => s.id);

                await StudentExam.updateMany(
                    { _id: { $in: successfulIds } },
                    {
                        $set: {
                            isPublished: true,
                            publishedAt: new Date(),
                            publishedBy: job.data.userId || 'system'
                        }
                    }
                );
            }

            const processingTime = Date.now() - startTime;

            console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} completed: ${successCount} success, ${errorCount} errors (${processingTime}ms)`);

            // Update progress in cache
            await this.updateProgress(examId, chunkIndex, totalChunks, successCount, errorCount);

            return {
                chunkIndex,
                successCount,
                errorCount,
                processingTime,
                serverId
            };

        } catch (error) {
            console.error(`❌ Chunk ${chunkIndex + 1} failed:`, error);
            errorCount = submissions.length;

            // Update progress with failure
            await this.updateProgress(examId, chunkIndex, totalChunks, 0, errorCount);

            throw error;
        }
    }

    /**
     * Process result aggregation after bulk operations
     */
    async processResultAggregation(job) {
        const { examId, totalChunks, jobIds, serverId } = job.data;

        console.log(`📊 Starting result aggregation for exam ${examId} (${totalChunks} chunks)`);

        // Wait for all chunk jobs to complete
        const results = [];
        let totalSuccess = 0;
        let totalErrors = 0;

        for (const jobId of jobIds) {
            try {
                const jobResult = await this.waitForJobCompletion(jobId, 300000); // 5 min timeout
                if (jobResult) {
                    results.push(jobResult);
                    totalSuccess += jobResult.successCount || 0;
                    totalErrors += jobResult.errorCount || 0;
                }
            } catch (error) {
                console.error(`Failed to get result for job ${jobId}:`, error);
                totalErrors += 1; // Assume error if we can't get result
            }
        }

        // Update final exam status
        await Exam.findByIdAndUpdate(examId, {
            $set: {
                bulkPublishCompleted: true,
                bulkPublishCompletedAt: new Date(),
                bulkPublishStats: {
                    totalChunks,
                    totalSuccess,
                    totalErrors,
                    processedBy: serverId,
                    completedAt: new Date()
                }
            }
        });

        // Send completion notification
        await this.queueManager.addJob('notifications', 'bulk-publish-complete', {
            examId,
            totalSuccess,
            totalErrors,
            serverId,
            completedAt: new Date()
        });

        console.log(`🎉 Bulk publish aggregation complete for exam ${examId}:`);
        console.log(`   - ${totalSuccess} successful, ${totalErrors} errors`);
        console.log(`   - Processed by ${serverId}`);

        return {
            examId,
            totalSuccess,
            totalErrors,
            totalChunks,
            serverId,
            completedAt: new Date()
        };
    }

    /**
     * Process notifications
     */
    async processNotification(job) {
        const { type, data } = job.data;

        switch (type) {
            case 'bulk-publish-complete':
                await this.sendBulkPublishNotification(data);
                break;
            default:
                console.warn(`Unknown notification type: ${type}`);
        }
    }

    // Helper methods

    /**
     * Warm cache for exam processing
     */
    async warmCacheForExam(examId, exam) {
        try {
            // Cache exam data
            await this.cache.set(`exam:${examId}`, exam, 7200);

            // Cache subject data
            if (exam.subject) {
                await this.cache.set(`subject:${exam.subject._id}`, exam.subject, 7200);
            }

            // Cache classroom data
            if (exam.classroom) {
                await this.cache.set(`classroom:${exam.classroom._id}`, exam.classroom, 7200);
            }

            console.log(`🔥 Cache warmed for exam ${examId}`);
        } catch (error) {
            console.warn('Cache warming failed:', error);
        }
    }

    /**
     * Update processing progress
     */
    async updateProgress(examId, chunkIndex, totalChunks, successCount, errorCount) {
        const progressKey = `progress:${examId}`;
        const currentProgress = await this.cache.get(progressKey) || {
            examId,
            totalChunks,
            completedChunks: 0,
            totalSuccess: 0,
            totalErrors: 0,
            startTime: Date.now(),
            lastUpdate: Date.now()
        };

        currentProgress.completedChunks++;
        currentProgress.totalSuccess += successCount;
        currentProgress.totalErrors += errorCount;
        currentProgress.lastUpdate = Date.now();
        currentProgress.progress = Math.round((currentProgress.completedChunks / totalChunks) * 100);

        await this.cache.set(progressKey, currentProgress, 3600);
    }

    /**
     * Wait for job completion with timeout
     */
    async waitForJobCompletion(jobId, timeout = 300000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const status = await this.queueManager.getJobStatus(jobId);

            if (status === 'completed') {
                // Get job result
                for (const [name, queue] of this.queueManager.queues) {
                    try {
                        const job = await queue.getJob(jobId);
                        if (job) {
                            return await job.finished();
                        }
                    } catch (error) {
                        // Continue
                    }
                }
            } else if (status === 'failed') {
                throw new Error(`Job ${jobId} failed`);
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error(`Job ${jobId} timed out`);
    }

    /**
     * Send bulk publish completion notification
     */
    async sendBulkPublishNotification(data) {
        // Implementation would integrate with notification service
        console.log(`📧 Bulk publish notification sent for exam ${data.examId}`);
    }

    /**
     * Chunk array utility
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Get processing progress
     */
    async getProgress(examId) {
        return await this.cache.get(`progress:${examId}`);
    }

    /**
     * Health check
     */
    async healthCheck() {
        const queueHealth = await this.queueManager.healthCheck();
        const cacheHealth = await this.cache.healthCheck();

        return {
            healthy: queueHealth.healthy && cacheHealth.healthy,
            queues: queueHealth,
            cache: cacheHealth,
            serverId: this.serverId
        };
    }
}

// Export singleton instance
let processorInstance = null;

export const getEnterpriseBulkProcessor = (serverId) => {
    if (!processorInstance) {
        processorInstance = new EnterpriseBulkProcessor(serverId);
    }
    return processorInstance;
};

export default EnterpriseBulkProcessor;
