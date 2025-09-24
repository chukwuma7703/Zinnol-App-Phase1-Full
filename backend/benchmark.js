import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { bulkUpdateOrCreateResults } from "./services/resultService.js";
import { cacheStudentResults, getCachedStudentResults } from "./config/cache.js";
import mongoose from "mongoose";

dotenv.config();

// Test configuration
const TEST_CONFIG = {
    students: parseInt(process.env.BENCHMARK_STUDENTS) || 2000,
    subjects: parseInt(process.env.BENCHMARK_SUBJECTS) || 25,
    batchSize: parseInt(process.env.BENCHMARK_BATCH_SIZE) || 100,
    iterations: parseInt(process.env.BENCHMARK_ITERATIONS) || 3,
};

class PerformanceBenchmark {
    constructor() {
        this.results = [];
        this.testData = {
            schoolId: new mongoose.Types.ObjectId(),
            classroomId: new mongoose.Types.ObjectId(),
            academicSession: "2024-2025",
            term: "First Term",
            userId: new mongoose.Types.ObjectId(),
        };
    }

    /**
     * Generate test data for benchmarking
     */
    generateTestData() {
        console.log(`🎯 Generating test data: ${TEST_CONFIG.students} students × ${TEST_CONFIG.subjects} subjects`);

        const students = [];
        const subjects = [];
        const resultUpdates = [];

        // Generate student IDs
        for (let i = 0; i < TEST_CONFIG.students; i++) {
            students.push(new mongoose.Types.ObjectId());
        }

        // Generate subject IDs
        for (let i = 0; i < TEST_CONFIG.subjects; i++) {
            subjects.push(new mongoose.Types.ObjectId());
        }

        // Generate result updates (50,000 total operations)
        for (const studentId of students) {
            for (const subjectId of subjects) {
                resultUpdates.push({
                    studentId,
                    schoolId: this.testData.schoolId,
                    classroomId: this.testData.classroomId,
                    academicSession: this.testData.academicSession,
                    term: this.testData.term,
                    subjectId,
                    score: Math.floor(Math.random() * 80) + 20, // Random score 20-100
                    maxScore: 100,
                    userId: this.testData.userId,
                });
            }
        }

        console.log(`✅ Generated ${resultUpdates.length} result updates`);
        return resultUpdates;
    }

    /**
     * Test bulk database operations performance
     */
    async testBulkOperations(resultUpdates) {
        console.log(`\n🔬 Testing bulk database operations...`);

        const results = [];
        const batches = this.chunkArray(resultUpdates, TEST_CONFIG.batchSize);

        for (let i = 0; i < TEST_CONFIG.iterations; i++) {
            console.log(`📊 Iteration ${i + 1}/${TEST_CONFIG.iterations}`);

            const startTime = Date.now();
            let totalModified = 0;
            let totalUpserted = 0;

            for (let j = 0; j < batches.length; j++) {
                const batch = batches[j];
                const batchStartTime = Date.now();

                const bulkResult = await bulkUpdateOrCreateResults(batch);
                totalModified += bulkResult.modifiedCount;
                totalUpserted += bulkResult.upsertedCount;

                const batchTime = Date.now() - batchStartTime;
                if (j % 10 === 0) { // Log every 10 batches
                    console.log(`  Batch ${j + 1}/${batches.length}: ${batchTime}ms (${Math.round(batch.length / (batchTime / 1000))} ops/sec)`);
                }
            }

            const totalTime = Date.now() - startTime;
            const operationsPerSecond = Math.round(resultUpdates.length / (totalTime / 1000));

            results.push({
                iteration: i + 1,
                totalTime,
                operationsPerSecond,
                totalModified,
                totalUpserted,
                batchSize: TEST_CONFIG.batchSize,
            });

            console.log(`  ✅ Iteration ${i + 1}: ${totalTime}ms (${operationsPerSecond} ops/sec, ${totalModified} modified, ${totalUpserted} upserted)`);
        }

        return results;
    }

    /**
     * Test caching performance
     */
    async testCachingPerformance(resultUpdates) {
        console.log(`\n🔬 Testing caching performance...`);

        const studentIds = [...new Set(resultUpdates.map(u => u.studentId))];
        const startTime = Date.now();

        // Test cache miss scenario
        const cachedResults = await getCachedStudentResults(studentIds, this.testData.academicSession, this.testData.term);
        const cacheMissTime = Date.now() - startTime;

        console.log(`📊 Cache performance: ${cachedResults.size}/${studentIds.length} hits (${cacheMissTime}ms)`);

        // Simulate caching results
        const mockResults = studentIds.map(studentId => ({
            student: studentId,
            session: this.testData.academicSession,
            term: this.testData.term,
            items: [],
        }));

        await cacheStudentResults(mockResults, this.testData.academicSession, this.testData.term);

        // Test cache hit scenario
        const cacheHitStartTime = Date.now();
        const cachedResultsAfter = await getCachedStudentResults(studentIds, this.testData.academicSession, this.testData.term);
        const cacheHitTime = Date.now() - cacheHitStartTime;

        console.log(`📊 Cache hit performance: ${cachedResultsAfter.size}/${studentIds.length} hits (${cacheHitTime}ms)`);

        return {
            cacheMissTime,
            cacheHitTime,
            cacheEfficiency: Math.round((1 - cacheHitTime / cacheMissTime) * 100),
        };
    }

    /**
     * Utility function to chunk arrays
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Run complete benchmark suite
     */
    async runBenchmark() {
        console.log(`🚀 Starting Zinnol Performance Benchmark`);
        console.log(`📋 Configuration: ${TEST_CONFIG.students} students × ${TEST_CONFIG.subjects} subjects = ${TEST_CONFIG.students * TEST_CONFIG.subjects} operations`);
        console.log(`📦 Batch size: ${TEST_CONFIG.batchSize}, Iterations: ${TEST_CONFIG.iterations}\n`);

        try {
            // Connect to database
            await connectDB();
            console.log(`✅ Connected to database\n`);

            // Generate test data
            const resultUpdates = this.generateTestData();

            // Run bulk operations test
            const bulkResults = await this.testBulkOperations(resultUpdates);

            // Run caching test
            const cacheResults = await this.testCachingPerformance(resultUpdates);

            // Calculate summary statistics
            const avgTime = bulkResults.reduce((sum, r) => sum + r.totalTime, 0) / bulkResults.length;
            const avgOpsPerSec = bulkResults.reduce((sum, r) => sum + r.operationsPerSecond, 0) / bulkResults.length;
            const totalOperations = TEST_CONFIG.students * TEST_CONFIG.subjects;

            // Estimate real-world performance
            const estimatedTimeFor2000Students = (2000 * 25 * 1000) / avgOpsPerSec; // in milliseconds
            const estimatedHours = Math.round(estimatedTimeFor2000Students / (1000 * 60 * 60) * 10) / 10;

            console.log(`\n📈 BENCHMARK RESULTS SUMMARY`);
            console.log(`═══════════════════════════════════════`);
            console.log(`Total Operations: ${totalOperations.toLocaleString()}`);
            console.log(`Average Processing Time: ${Math.round(avgTime)}ms`);
            console.log(`Average Operations/Second: ${avgOpsPerSec.toLocaleString()}`);
            console.log(`Cache Efficiency: ${cacheResults.cacheEfficiency}%`);
            console.log(`\n🎯 Estimated Performance for 2000 Students × 25 Subjects:`);
            console.log(`   Processing Time: ~${estimatedHours} hours`);
            console.log(`   Operations/Second: ${avgOpsPerSec.toLocaleString()}`);
            console.log(`   Memory Usage: ~${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB (current)`);

            // Performance recommendations
            console.log(`\n💡 RECOMMENDATIONS:`);
            if (avgOpsPerSec < 1000) {
                console.log(`   ⚠️  Low throughput detected. Consider:`);
                console.log(`      - Increasing batch size`);
                console.log(`      - Adding database indexes`);
                console.log(`      - Using SSD storage`);
            } else if (avgOpsPerSec > 5000) {
                console.log(`   ✅ Excellent performance! System can handle large loads.`);
            } else {
                console.log(`   ✓ Good performance. System should handle 2000×25 efficiently.`);
            }

            if (cacheResults.cacheEfficiency < 50) {
                console.log(`   ⚠️  Low cache efficiency. Consider:`);
                console.log(`      - Increasing Redis memory allocation`);
                console.log(`      - Optimizing cache TTL settings`);
            }

        } catch (error) {
            console.error(`❌ Benchmark failed:`, error);
        } finally {
            // Close database connection
            await mongoose.connection.close();
            console.log(`\n🏁 Benchmark completed`);
        }
    }
}

// Run benchmark if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const benchmark = new PerformanceBenchmark();
    benchmark.runBenchmark().catch(console.error);
}

export default PerformanceBenchmark;
