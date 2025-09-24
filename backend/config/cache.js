import Redis from "ioredis";

let redisClient;

/**
 * Initializes the Redis client connection.
 * This should be called once when the server starts.
 */
export const initRedis = () => {
  if (!process.env.REDIS_URL) {
    console.warn("⚠️ REDIS_URL not found in .env, caching will be disabled.");
    return;
  }

  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
    });

    redisClient.on("connect", () => console.log("✅ Redis client connected"));
    redisClient.on("error", (err) => console.error("❌ Redis connection error:", err));
  } catch (error) {
    console.error("❌ Could not create Redis client:", error);
  }
};

/**
 * Retrieves a value from the cache.
 * @param {string} key The cache key.
 * @returns {Promise<any|null>} The parsed value or null if not found.
 */
export const getCache = async (key) => {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`❌ Redis GET error for key "${key}":`, error);
    return null;
  }
};

/**
 * Stores a value in the cache with an expiration time.
 * @param {string} key The cache key.
 * @param {any} value The value to store (must be JSON-serializable).
 * @param {number} ttlSeconds The time-to-live in seconds.
 */
export const setCache = async (key, value, ttlSeconds = 3600) => {
  if (!redisClient) return;
  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.error(`❌ Redis SET error for key "${key}":`, error);
  }
};

/**
 * Deletes a value from the cache.
 * @param {string} key The cache key to delete.
 */
export const deleteCache = async (key) => {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`❌ Redis DEL error for key "${key}":`, error);
  }
};

/**
 * Sets multiple cache keys at once.
 * @param {Array<Array>} keyValuePairs Array of [key, value] pairs.
 * @param {number} ttlSeconds The time-to-live in seconds.
 */
export const setMultipleCache = async (keyValuePairs, ttlSeconds = 3600) => {
  if (!redisClient) return;
  try {
    const pipeline = redisClient.multi();
    for (const [key, value] of keyValuePairs) {
      pipeline.set(key, JSON.stringify(value), "EX", ttlSeconds);
    }
    await pipeline.exec();
  } catch (error) {
    console.error(`❌ Redis MSET error:`, error);
  }
};

/**
 * Gets multiple values from the cache.
 * @param {Array<string>} keys Array of cache keys.
 * @returns {Promise<Array<any|null>>} Array of parsed values or null if not found.
 */
export const getMultipleCache = async (keys) => {
  if (!redisClient) return keys.map(() => null);
  try {
    const values = await redisClient.mget(keys);
    return values.map(value => value ? JSON.parse(value) : null);
  } catch (error) {
    console.error(`❌ Redis MGET error:`, error);
    return keys.map(() => null);
  }
};

/**
 * Generates a cache key for student results.
 * @param {string} studentId Student ID.
 * @param {string} session Academic session.
 * @param {string} term Academic term.
 * @returns {string} Cache key.
 */
export const getResultCacheKey = (studentId, session, term) => {
  return `result:${studentId}:${session}:${term}`;
};

/**
 * Caches multiple student results for bulk operations.
 * @param {Array} results Array of result documents.
 * @param {string} session Academic session.
 * @param {string} term Academic term.
 * @param {number} ttlSeconds Cache TTL in seconds.
 */
export const cacheStudentResults = async (results, session, term, ttlSeconds = 1800) => {
  if (!redisClient || !results.length) return;

  const keyValuePairs = results.map(result => [
    getResultCacheKey(result.student, session, term),
    result
  ]);

  await setMultipleCache(keyValuePairs, ttlSeconds);
};

/**
 * Gets cached student results for bulk operations.
 * @param {Array<string>} studentIds Array of student IDs.
 * @param {string} session Academic session.
 * @param {string} term Academic term.
 * @returns {Promise<Map>} Map of studentId -> result document.
 */
export const getCachedStudentResults = async (studentIds, session, term) => {
  if (!redisClient) return new Map();

  const keys = studentIds.map(studentId => getResultCacheKey(studentId, session, term));
  const cachedResults = await getMultipleCache(keys);

  const resultsMap = new Map();
  studentIds.forEach((studentId, index) => {
    if (cachedResults[index]) {
      resultsMap.set(studentId, cachedResults[index]);
    }
  });

  return resultsMap;
};

/**
 * Invalidates cached results for students (useful after bulk updates).
 * @param {Array<string>} studentIds Array of student IDs.
 * @param {string} session Academic session.
 * @param {string} term Academic term.
 */
export const invalidateStudentResultCache = async (studentIds, session, term) => {
  if (!redisClient) return;

  const keys = studentIds.map(studentId => getResultCacheKey(studentId, session, term));
  await Promise.all(keys.map(key => deleteCache(key)));
};

/**
 * Check if Redis is connected and ready
 * @returns {boolean} Redis connection status
 */
export const isRedisReady = () => {
  return !!(redisClient && redisClient.status === 'ready');
};

/**
 * Get the Redis client instance (for health checks)
 * @returns {Redis|null} Redis client or null if not initialized
 */
export const getRedisClient = () => redisClient;

// Export redisClient for health checks
export { redisClient };