/**
 * Unit Test Setup
 * Similar to global setup but without mocking sendEmail,
 * and light on heavy external mocks to favor isolated unit tests.
 */
import { createRequire } from 'module';
import { vi } from 'vitest';
// eslint-disable-next-line no-undef
const _require = typeof require === 'function' ? require : createRequire(process.cwd() + '/');

const dotenv = _require('dotenv');
dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.MONGO_URI = 'mongodb://localhost:27017/zinnol-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '4001';

// Quiet console for unit tests
const originalConsole = global.console;
global.console = Object.assign({}, originalConsole, {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
});

// Keep lightweight mocks that are safe for units
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
    getCachedStudentResults: vi.fn(async () => new Map()),
    cacheStudentResults: vi.fn(async () => { }),
    invalidateStudentResultCache: vi.fn(async () => { }),
}));

// Patch mongoose.disconnect to no-op to avoid open handles
try {
    const mongoose = _require('mongoose');
    if (mongoose && typeof mongoose.disconnect === 'function' && !mongoose.__patchedDisconnect) {
        mongoose.__originalDisconnect = mongoose.disconnect;
        mongoose.disconnect = async () => { };
        mongoose.__patchedDisconnect = true;
    }
} catch { /* ignore */ }

afterAll(async () => {
    try {
        const mongoose = _require('mongoose');
        const open = mongoose.connections.filter(c => c.readyState === 1);
        for (const conn of open) {
            try { await conn.close(true); } catch { /* noop */ }
        }
    } catch { /* ignore */ }

    // Guard against environments/tests that mock or remove timers
    if (typeof setTimeout === 'function') {
        const maxId = setTimeout(() => { }, 0);
        for (let i = 1; i <= maxId; i++) { clearTimeout(i); clearInterval(i); }
        clearTimeout(maxId);
    }
});
