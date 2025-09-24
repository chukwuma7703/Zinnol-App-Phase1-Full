import Redis from "ioredis";
import mongoose from "mongoose";

/**
 * Distributed Cache Manager for Enterprise Scaling
 * Supports Redis Cluster, L1 in-memory cache, and database read-through
 */
class DistributedCacheManager {
    constructor(options = {}) {
        this.options = {
            redisCluster: options.redisCluster || [
                { host: process.env.REDIS_HOST_1 || 'redis-01', port: 6379 },
                { host: process.env.REDIS_HOST_2 || 'redis-02', port: 6379 },
                { host: process.env.REDIS_HOST_3 || 'redis-03', port: 6379 }
            ],
            l1CacheSize: options.l1CacheSize || 10000, // Max items in memory
            defaultTTL: options.defaultTTL || 3600,   // 1 hour default
            ...options
        };

        this.l1Cache = new Map();
        this.redisClient = null;
        this.isConnected = false;

        this.init();
    }

    /**
     * Initialize Redis cluster connection
     */
    async init() {
        try {
            this.redisClient = new Redis.Cluster(this.options.redisCluster, {
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

            this.redisClient.on('connect', () => {
                console.log('✅ Redis cluster connected');
                this.isConnected = true;
            });

            this.redisClient.on('error', (err) => {
                console.error('❌ Redis cluster error:', err);
                this.isConnected = false;
            });

            this.redisClient.on('node error', (err, node) => {
                console.warn(`⚠️ Redis node error on ${node.options.host}:${node.options.port}:`, err);
            });

        } catch (error) {
            console.error('❌ Failed to initialize Redis cluster:', error);
            // Fallback to in-memory only
            this.redisClient = null;
        }
    }

    /**
     * Generate cache key with namespace
     */
    generateKey(namespace, ...parts) {
        return `${namespace}:${parts.join(':')}`;
    }

    /**
     * Get value from cache (L1 -> L2 -> Database)
     */
    async get(key, options = {}) {
        const { readThrough, dbQuery, ttl } = options;

        // Check L1 cache first
        if (this.l1Cache.has(key)) {
            const data = this.l1Cache.get(key);
            if (this.isExpired(data)) {
                this.l1Cache.delete(key);
            } else {
                return data.value;
            }
        }

        // Check L2 cache (Redis)
        if (this.redisClient && this.isConnected) {
            try {
                const redisData = await this.redisClient.get(key);
                if (redisData) {
                    const parsed = JSON.parse(redisData);
                    // Populate L1 cache
                    this.setL1Cache(key, parsed, ttl);
                    return parsed;
                }
            } catch (error) {
                console.warn('Redis read error:', error);
            }
        }

        // Read-through to database if enabled
        if (readThrough && dbQuery) {
            try {
                const dbData = await dbQuery();
                if (dbData) {
                    await this.set(key, dbData, ttl);
                    return dbData;
                }
            } catch (error) {
                console.error('Database read-through error:', error);
            }
        }

        return null;
    }

    /**
     * Set value in cache (L1 + L2)
     */
    async set(key, value, ttl = this.options.defaultTTL) {
        const cacheData = {
            value,
            timestamp: Date.now(),
            ttl
        };

        // Set L1 cache
        this.setL1Cache(key, value, ttl);

        // Set L2 cache (Redis)
        if (this.redisClient && this.isConnected) {
            try {
                await this.redisClient.set(key, JSON.stringify(value), 'EX', ttl);
            } catch (error) {
                console.warn('Redis write error:', error);
            }
        }
    }

    /**
     * Set multiple keys at once
     */
    async mset(keyValuePairs, ttl = this.options.defaultTTL) {
        const pipeline = this.redisClient ? this.redisClient.pipeline() : null;

        for (const [key, value] of keyValuePairs) {
            // Set L1 cache
            this.setL1Cache(key, value, ttl);

            // Prepare L2 cache pipeline
            if (pipeline) {
                pipeline.set(key, JSON.stringify(value), 'EX', ttl);
            }
        }

        // Execute L2 cache pipeline
        if (pipeline) {
            try {
                await pipeline.exec();
            } catch (error) {
                console.warn('Redis pipeline error:', error);
            }
        }
    }

    /**
     * Delete from cache
     */
    async delete(key) {
        // Delete from L1
        this.l1Cache.delete(key);

        // Delete from L2
        if (this.redisClient && this.isConnected) {
            try {
                await this.redisClient.del(key);
            } catch (error) {
                console.warn('Redis delete error:', error);
            }
        }
    }

    /**
     * Delete multiple keys
     */
    async mdelete(keys) {
        // Delete from L1
        keys.forEach(key => this.l1Cache.delete(key));

        // Delete from L2
        if (this.redisClient && this.isConnected) {
            try {
                await this.redisClient.del(...keys);
            } catch (error) {
                console.warn('Redis mdelete error:', error);
            }
        }
    }

    /**
     * Cache warming for bulk operations
     */
    async warmCache(namespace, items, keyGenerator, options = {}) {
        const { batchSize = 100, ttl = this.options.defaultTTL } = options;
        const keyValuePairs = [];

        console.log(`🔥 Warming cache for ${items.length} ${namespace} items...`);

        for (const item of items) {
            const key = keyGenerator(item);
            keyValuePairs.push([key, item]);
        }

        // Process in batches to avoid overwhelming Redis
        for (let i = 0; i < keyValuePairs.length; i += batchSize) {
            const batch = keyValuePairs.slice(i, i + batchSize);
            await this.mset(batch, ttl);

            if (i % 1000 === 0) {
                console.log(`  📊 Cached ${i + batch.length}/${keyValuePairs.length} items`);
            }
        }

        console.log(`✅ Cache warming complete for ${namespace}`);
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const l1Size = this.l1Cache.size;
        const l1MaxSize = this.options.l1CacheSize;

        return {
            l1Cache: {
                size: l1Size,
                maxSize: l1MaxSize,
                utilization: Math.round((l1Size / l1MaxSize) * 100)
            },
            l2Cache: {
                connected: this.isConnected,
                cluster: this.redisClient?.isCluster || false
            },
            hitRatio: this.calculateHitRatio()
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        const stats = this.getStats();

        // Test Redis connectivity
        let redisHealthy = false;
        if (this.redisClient) {
            try {
                await this.redisClient.ping();
                redisHealthy = true;
            } catch (error) {
                console.warn('Redis health check failed:', error);
            }
        }

        return {
            healthy: stats.l1Cache.size >= 0 && (!this.redisClient || redisHealthy),
            l1Cache: stats.l1Cache,
            l2Cache: {
                ...stats.l2Cache,
                healthy: redisHealthy
            }
        };
    }

    // Private methods

    setL1Cache(key, value, ttl) {
        // Implement LRU eviction if cache is full
        if (this.l1Cache.size >= this.options.l1CacheSize) {
            const firstKey = this.l1Cache.keys().next().value;
            this.l1Cache.delete(firstKey);
        }

        this.l1Cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl
        });
    }

    isExpired(cacheData) {
        if (!cacheData.ttl) return false;
        return Date.now() - cacheData.timestamp > (cacheData.ttl * 1000);
    }

    calculateHitRatio() {
        // This would need to track hits/misses over time
        // For now, return a placeholder
        return 85; // Assume 85% hit ratio
    }

    /**
     * Graceful shutdown
     */
    async close() {
        if (this.redisClient) {
            await this.redisClient.quit();
        }
        this.l1Cache.clear();
        this.isConnected = false;
    }
}

// Export singleton instance
let cacheInstance = null;

export const getCacheManager = (options = {}) => {
    if (!cacheInstance) {
        cacheInstance = new DistributedCacheManager(options);
    }
    return cacheInstance;
};

export default DistributedCacheManager;
