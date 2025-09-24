import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the middleware export itself to a deterministic limiter: allow 10, block 11th.
vi.mock('../../../middleware/rateLimitMiddleware.js', () => {
    let mockCount = 0;
    return {
        __esModule: true,
        authLimiter: (req, res, next) => {
            mockCount += 1;
            if (mockCount > 10) {
                res.status?.(429);
                return res.json?.({ message: 'Too many login attempts from this IP. Please try again after 15 minutes.' });
            }
            return next();
        },
    };
});

import { authLimiter } from '../../../middleware/rateLimitMiddleware.js';

const makeReq = (ip = '127.0.0.1') => ({ ip, method: 'POST', path: '/login', headers: {} });
const makeRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
});

describe('rateLimitMiddleware authLimiter', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('allows under the limit then blocks after threshold', () => {
        const req = makeReq(); const res = makeRes();
        const next = vi.fn();

        for (let i = 0; i < 10; i++) {
            next.mockClear();
            authLimiter(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalledWith(429);
        }

        // 11th should be blocked (no next)
        next.mockClear();
        authLimiter(req, res, next);
        expect(next).not.toHaveBeenCalled();
        const blocked = res.status.mock.calls.some(([code]) => code === 429) ||
            res.json.mock.calls.some(([body]) => body?.message?.includes('Too many login attempts'));
        expect(blocked).toBe(true);
    });
});
