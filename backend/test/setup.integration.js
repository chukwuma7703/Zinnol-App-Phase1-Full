// Lightweight integration test setup
// Do NOT connect to MongoDB here. Integration tests in this repo manage their
// own MongoMemoryServer instances and call mongoose.connect themselves.
// We only set env flags and extend timeouts to reduce flakiness.

import { vi } from 'vitest';

beforeAll(async () => {
    // Set test timeout for integration tests
    vi.setConfig({ testTimeout: 90000 });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret';
    process.env.DISABLE_REDIS = 'true';
    process.env.DISABLE_CRON = 'true';
    process.env.DISABLE_MONITORING = 'true';
});

afterAll(async () => {
    // Best-effort timers cleanup only (tests handle DB teardown)
    const maxTimerId = setTimeout(() => { }, 0);
    for (let i = 1; i <= maxTimerId; i++) {
        clearTimeout(i);
        clearInterval(i);
    }
});

