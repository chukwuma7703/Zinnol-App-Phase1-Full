// Vitest setup file - minimal setup, tests manage their own DB connections
import { vi } from 'vitest';

beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.DISABLE_REDIS = 'true';
    process.env.DISABLE_CRON = 'true';
    process.env.DISABLE_MONITORING = 'true';

    // Mock localStorage for tests that need it
    global.localStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
    };

    // Mock window for tests that need it
    global.window = {
        localStorage: global.localStorage,
    };
});

afterAll(async () => {
    // Cleanup timers
    const maxTimerId = setTimeout(() => { }, 0);
    for (let i = 1; i <= maxTimerId; i++) {
        clearTimeout(i);
        clearInterval(i);
    }
});
