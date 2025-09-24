import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Redis before importing cache module
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  mget: vi.fn(),
  multi: vi.fn(),
  on: vi.fn(),
  status: 'ready',
  quit: vi.fn()
};

const mockPipeline = {
  set: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([])
};

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisClient)
}));

// Mock console methods
const originalConsole = global.console;
beforeEach(() => {
  global.console = {
    ...originalConsole,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
});

afterEach(() => {
  global.console = originalConsole;
});

describe('cache configuration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    vi.clearAllMocks();
    mockRedisClient.multi.mockReturnValue(mockPipeline);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('initRedis', () => {
    it('should warn when REDIS_URL is not provided', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis } = await import('../../../config/cache.js');
      initRedis();

      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ REDIS_URL not found in .env, caching will be disabled."
      );
    });

    it('should initialize Redis client with correct configuration', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

      const Redis = (await import('ioredis')).default;
      const { initRedis } = await import('../../../config/cache.js');

      initRedis();

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', {
        maxRetriesPerRequest: null,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
      });
    });

    it('should set up Redis event listeners', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

      const { initRedis } = await import('../../../config/cache.js');
      initRedis();

      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle Redis client creation errors', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

      const Redis = (await import('ioredis')).default;
      Redis.mockImplementationOnce(() => {
        throw new Error('Redis connection failed');
      });

      const { initRedis } = await import('../../../config/cache.js');
      initRedis();

      expect(console.error).toHaveBeenCalledWith(
        "❌ Could not create Redis client:",
        expect.any(Error)
      );
    });
  });

  describe('getCache', () => {
    it('should return null when Redis client is not initialized', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis, getCache } = await import('../../../config/cache.js');
      initRedis(); // This won't create a client due to missing REDIS_URL

      const result = await getCache('test-key');
      expect(result).toBeNull();
    });

    it('should retrieve and parse cached data', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const testData = { message: 'Hello, World!' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const { initRedis, getCache } = await import('../../../config/cache.js');
      initRedis();

      const result = await getCache('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(testData);
    });

    it('should return null when key does not exist', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      mockRedisClient.get.mockResolvedValue(null);

      const { initRedis, getCache } = await import('../../../config/cache.js');
      initRedis();

      const result = await getCache('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const { initRedis, getCache } = await import('../../../config/cache.js');
      initRedis();

      const result = await getCache('error-key');

      expect(console.error).toHaveBeenCalledWith(
        '❌ Redis GET error for key "error-key":',
        expect.any(Error)
      );
      expect(result).toBeNull();
    });

    it('should handle JSON parsing errors', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      mockRedisClient.get.mockResolvedValue('invalid json');

      const { initRedis, getCache } = await import('../../../config/cache.js');
      initRedis();

      const result = await getCache('invalid-json-key');

      expect(console.error).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('setCache', () => {
    it('should do nothing when Redis client is not initialized', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis, setCache } = await import('../../../config/cache.js');
      initRedis();

      await setCache('test-key', { data: 'test' });

      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should store data with default TTL', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const testData = { message: 'Hello, World!' };

      const { initRedis, setCache } = await import('../../../config/cache.js');
      initRedis();

      await setCache('test-key', testData);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(testData),
        'EX',
        3600
      );
    });

    it('should store data with custom TTL', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const testData = { message: 'Hello, World!' };

      const { initRedis, setCache } = await import('../../../config/cache.js');
      initRedis();

      await setCache('test-key', testData, 1800);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(testData),
        'EX',
        1800
      );
    });

    it('should handle Redis errors gracefully', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      const { initRedis, setCache } = await import('../../../config/cache.js');
      initRedis();

      await setCache('error-key', { data: 'test' });

      expect(console.error).toHaveBeenCalledWith(
        '❌ Redis SET error for key "error-key":',
        expect.any(Error)
      );
    });
  });

  describe('deleteCache', () => {
    it('should do nothing when Redis client is not initialized', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis, deleteCache } = await import('../../../config/cache.js');
      initRedis();

      await deleteCache('test-key');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should delete cache key', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

      const { initRedis, deleteCache } = await import('../../../config/cache.js');
      initRedis();

      await deleteCache('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle Redis errors gracefully', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      const { initRedis, deleteCache } = await import('../../../config/cache.js');
      initRedis();

      await deleteCache('error-key');

      expect(console.error).toHaveBeenCalledWith(
        '❌ Redis DEL error for key "error-key":',
        expect.any(Error)
      );
    });
  });

  describe('setMultipleCache', () => {
    it('should set multiple cache entries using pipeline', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const keyValuePairs = [
        ['key1', { data: 'value1' }],
        ['key2', { data: 'value2' }]
      ];

      const { initRedis, setMultipleCache } = await import('../../../config/cache.js');
      initRedis();

      await setMultipleCache(keyValuePairs, 1800);

      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledWith('key1', JSON.stringify({ data: 'value1' }), 'EX', 1800);
      expect(mockPipeline.set).toHaveBeenCalledWith('key2', JSON.stringify({ data: 'value2' }), 'EX', 1800);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should do nothing when Redis client is not initialized', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis, setMultipleCache } = await import('../../../config/cache.js');
      initRedis();

      await setMultipleCache([['key1', 'value1']]);

      expect(mockRedisClient.multi).not.toHaveBeenCalled();
    });
  });

  describe('getMultipleCache', () => {
    it('should retrieve multiple cache entries', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const keys = ['key1', 'key2', 'key3'];
      const values = [JSON.stringify({ data: 'value1' }), null, JSON.stringify({ data: 'value3' })];
      mockRedisClient.mget.mockResolvedValue(values);

      const { initRedis, getMultipleCache } = await import('../../../config/cache.js');
      initRedis();

      const result = await getMultipleCache(keys);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(result).toEqual([{ data: 'value1' }, null, { data: 'value3' }]);
    });

    it('should return null array when Redis client is not initialized', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis, getMultipleCache } = await import('../../../config/cache.js');
      initRedis();

      const result = await getMultipleCache(['key1', 'key2']);

      expect(result).toEqual([null, null]);
    });
  });

  describe('utility functions', () => {
    it('should generate correct result cache key', async () => {
      const { getResultCacheKey } = await import('../../../config/cache.js');

      const key = getResultCacheKey('student123', '2023/2024', '1');

      expect(key).toBe('result:student123:2023/2024:1');
    });

    it('should check Redis ready status', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

      const { initRedis, isRedisReady } = await import('../../../config/cache.js');
      initRedis();

      const isReady = isRedisReady();

      expect(isReady).toBe(true);
    });

    it('should return false for Redis ready status when not initialized', async () => {
      process.env = { ...originalEnv };
      delete process.env.REDIS_URL;

      const { initRedis, isRedisReady } = await import('../../../config/cache.js');
      initRedis();

      const isReady = isRedisReady();

      expect(isReady).toBe(false);
    });

    it('should return Redis client instance', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

      const { initRedis, getRedisClient } = await import('../../../config/cache.js');
      initRedis();

      const client = getRedisClient();

      expect(client).toBe(mockRedisClient);
    });
  });

  describe('student result caching functions', () => {
    it('should cache student results', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const results = [
        { student: 'student1', average: 85 },
        { student: 'student2', average: 92 }
      ];

      const { initRedis, cacheStudentResults } = await import('../../../config/cache.js');
      initRedis();

      await cacheStudentResults(results, '2023/2024', '1', 1800);

      expect(mockPipeline.set).toHaveBeenCalledWith(
        'result:student1:2023/2024:1',
        JSON.stringify(results[0]),
        'EX',
        1800
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        'result:student2:2023/2024:1',
        JSON.stringify(results[1]),
        'EX',
        1800
      );
    });

    it('should get cached student results', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const studentIds = ['student1', 'student2'];
      const cachedResults = [
        JSON.stringify({ student: 'student1', average: 85 }),
        null
      ];
      mockRedisClient.mget.mockResolvedValue(cachedResults);

      const { initRedis, getCachedStudentResults } = await import('../../../config/cache.js');
      initRedis();

      const result = await getCachedStudentResults(studentIds, '2023/2024', '1');

      expect(result).toBeInstanceOf(Map);
      expect(result.get('student1')).toEqual({ student: 'student1', average: 85 });
      expect(result.has('student2')).toBe(false);
    });

    it('should invalidate student result cache', async () => {
      process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };
      const studentIds = ['student1', 'student2'];

      const { initRedis, invalidateStudentResultCache } = await import('../../../config/cache.js');
      initRedis();

      await invalidateStudentResultCache(studentIds, '2023/2024', '1');

      expect(mockRedisClient.del).toHaveBeenCalledWith('result:student1:2023/2024:1');
      expect(mockRedisClient.del).toHaveBeenCalledWith('result:student2:2023/2024:1');
    });
  });
});