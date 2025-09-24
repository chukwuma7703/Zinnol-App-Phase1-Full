/**
 * Global Test Setup
 * Configures test environmvi.mock('../utils/sendEmail.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../config/cache.js', () => ({
  initRedis: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
  isRedisReady: vi.fn().mockReturnValue(true),
  getRedisClient: vi.fn().mockReturnValue({
    status: 'ready',
    on: vi.fn(),
    quit: vi.fn(),
  }),
  // Bulk publish helpers used in controllers
  getCachedStudentResults: vi.fn(async () => new Map()),
  cacheStudentResults: vi.fn(async () => { }),
  invalidateStudentResultCache: vi.fn(async () => { }),
}));tes
 */

// Support both CJS and ESM Jest runtimes by creating a safe require function
import { createRequire } from 'module';
import { vi } from 'vitest';
// If native require exists (CJS transform) use it; otherwise create one for ESM context without import.meta
// eslint-disable-next-line no-undef
const _require = typeof require === 'function' ? require : createRequire(process.cwd() + '/');

const dotenv = _require('dotenv');

// Load test environment
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.MONGO_URI = 'mongodb://localhost:27017/zinnol-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '4001';

// Note: DB connections are managed per-suite to avoid conflicts

// Mock console to reduce noise
const originalConsole = global.console;
global.console = Object.assign({}, originalConsole, {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
});

// Mock external services
vi.mock('../config/firebaseAdmin.js', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
    }),
    messaging: () => ({
      send: vi.fn(),
      sendMulticast: vi.fn(),
    }),
  },
  initializeApp: vi.fn(),
}));

vi.mock('../utils/sendEmail.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../config/cache.js', () => ({
  initRedis: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
  isRedisReady: vi.fn().mockReturnValue(true),
  getRedisClient: vi.fn().mockReturnValue({
    status: 'ready',
    on: vi.fn(),
    quit: vi.fn(),
  }),
  // Bulk publish helpers used in controllers
  getCachedStudentResults: vi.fn(async () => new Map()),
  cacheStudentResults: vi.fn(async () => { }),
  invalidateStudentResultCache: vi.fn(async () => { }),
}));

// bullmq is mapped to a mock via vitest.config.js moduleNameMapper

// Global test helpers
global.testHelpers = {
  generateObjectId: () => {
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const random = Math.random().toString(16).substring(2, 18);
    return timestamp + random;
  },

  createMockRequest: (options = {}) => ({
    body: {},
    query: {},
    params: {},
    headers: {},
    user: null,
    ...options,
  }),

  createMockResponse: () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
    return res;
  },

  createMockNext: () => vi.fn(),
};

// Prevent per-suite premature disconnects: monkey patch mongoose.disconnect to a no-op.
try {
  const mongoose = _require('mongoose');
  if (mongoose && typeof mongoose.disconnect === 'function' && !mongoose.__patchedDisconnect) {
    mongoose.__originalDisconnect = mongoose.disconnect;
    mongoose.disconnect = async () => { /* no-op during tests; globalTeardown will close */ };
    mongoose.__patchedDisconnect = true;
  }
} catch { /* ignore */ }

// Diagnostics & safety: after all tests, log and close any stray mongoose connections.
afterAll(async () => {
  try {
    const mongoose = _require('mongoose');
    const open = mongoose.connections.filter(c => c.readyState === 1);
    if (open.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[jest-teardown] Closing ${open.length} stray mongoose connection(s).`);
      for (const conn of open) {
        try { await conn.close(true); } catch { /* noop */ }
      }
    }
  } catch { /* ignore */ }

  // Clear any remaining timers (defensive; main teardown also does this)
  const maxId = setTimeout(() => { }, 0);
  for (let i = 1; i <= maxId; i++) { clearTimeout(i); clearInterval(i); }
  clearTimeout(maxId);
});