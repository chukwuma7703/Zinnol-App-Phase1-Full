import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        stream: { write: vi.fn() },
    },
}));

let requestTracking;
beforeAll(async () => {
    ({ requestTracking } = await import('../../middleware/requestTracking.js'));
});

function mockReqRes() {
    const req = { headers: {}, method: 'GET', originalUrl: '/', ip: '::1', get: () => 'jest' };
    const res = { setHeader: vi.fn(), statusCode: 200, json: (x) => x, on: vi.fn() };
    const next = vi.fn();
    return { req, res, next };
}

describe('requestTracking middleware', () => {
    it('assigns request id and wraps res.json', () => {
        const { req, res, next } = mockReqRes();
        requestTracking(req, res, next);
        expect(req).toHaveProperty('id');
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
        expect(next).toHaveBeenCalled();
    });
});
