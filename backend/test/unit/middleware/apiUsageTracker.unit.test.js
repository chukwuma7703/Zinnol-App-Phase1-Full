import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({ __esModule: true, default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import logger from '../../../utils/logger.js';

// cache is dynamically imported in the middleware; vitest.setup mocks it globally, but we define explicit mocks here for clarity
vi.mock('../../../config/cache.js', () => ({
    __esModule: true,
    initRedis: vi.fn(),
    getCache: vi.fn(),
    setCache: vi.fn(),
    deleteCache: vi.fn(),
    isRedisReady: vi.fn().mockReturnValue(true),
    getRedisClient: vi.fn().mockReturnValue({ quit: vi.fn(), on: vi.fn() })
}));

import { apiUsageTracker } from '../../../middleware/requestTracking.js';
import * as cache from '../../../config/cache.js';

const mockRes = () => ({ setHeader: vi.fn() });
const mockReq = (overrides = {}) => ({
    user: null,
    ...overrides,
});
const next = vi.fn();

describe('middleware/apiUsageTracker', () => {
    beforeEach(() => vi.clearAllMocks());

    it('no-op when req.user missing', async () => {
        const req = mockReq({ user: null });
        const res = mockRes();
        await apiUsageTracker(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('increments usage and sets header', async () => {
        cache.getCache.mockResolvedValue(1);
        cache.setCache.mockResolvedValue(true);

        const req = mockReq({ user: { _id: 'u1' } });
        const res = mockRes();

        await apiUsageTracker(req, res, next);

        expect(cache.getCache).toHaveBeenCalled();
        expect(cache.setCache).toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('X-API-Usage-Today', 2);
        expect(next).toHaveBeenCalled();
    });

    it('increments from zero/undefined and sets header to 1', async () => {
        cache.getCache.mockResolvedValue(undefined);
        cache.setCache.mockResolvedValue(true);

        const req = mockReq({ user: { _id: 'u2' } });
        const res = mockRes();

        await apiUsageTracker(req, res, next);

        expect(cache.setCache).toHaveBeenCalledWith(expect.any(String), 1, 86400);
        expect(res.setHeader).toHaveBeenCalledWith('X-API-Usage-Today', 1);
        expect(next).toHaveBeenCalled();
    });

    it('logs error but still next on failure', async () => {
        cache.getCache.mockRejectedValue(new Error('redis down'));
        const req = mockReq({ user: { _id: 'u1' } });
        const res = mockRes();

        await apiUsageTracker(req, res, next);

        expect(logger.error).toHaveBeenCalled();
        expect(res.setHeader).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});
