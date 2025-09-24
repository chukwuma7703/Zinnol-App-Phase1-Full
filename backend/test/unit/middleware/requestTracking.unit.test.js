import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({ __esModule: true, default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import logger from '../../../utils/logger.js';

import { requestTracking, slowRequestLogger } from '../../../middleware/requestTracking.js';

const mockRes = () => {
    const res = {
        statusCode: 200,
        setHeader: vi.fn(),
    };
    res.json = vi.fn().mockImplementation(function (data) { return res; });
    res.on = vi.fn((event, handler) => { if (event === 'finish') { res._finish = handler; } });
    res.finish = () => { if (res._finish) res._finish(); };
    return res;
};

const mockReq = (overrides = {}) => ({
    method: 'GET',
    originalUrl: '/x',
    ip: '127.0.0.1',
    get: vi.fn(() => 'agent'),
    headers: {},
    ...overrides,
});

const next = vi.fn();

describe('middleware/requestTracking', () => {
    beforeEach(() => vi.clearAllMocks());

    it('adds request id, headers, and logs on json', () => {
        const req = mockReq();
        const res = mockRes();

        const start = Date.now();
        requestTracking(req, res, next);

        expect(req.id).toBeDefined();
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
        expect(next).toHaveBeenCalled();

        res.json({ ok: true });
        expect(res.setHeader).toHaveBeenCalledWith(expect.stringMatching(/^X-Response-Time$/), expect.stringMatching(/ms$/));
    });

    it('uses provided x-request-id header (no uuid)', () => {
        const req = mockReq({ headers: { 'x-request-id': 'rid-123' } });
        const res = mockRes();

        requestTracking(req, res, next);

        expect(req.id).toBe('rid-123');
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'rid-123');
    });

    it('slowRequestLogger triggers warn when threshold exceeded', () => {
        const req = mockReq({ id: 'rid' });
        const res = mockRes();

        const mw = slowRequestLogger(0); // zero threshold to always trigger
        const realNow = Date.now;
        let t = 1000;
        Date.now = vi.fn(() => t);
        mw(req, res, next);
        expect(next).toHaveBeenCalled();
        t += 10; // advance time
        // simulate response finish
        res.finish();
        Date.now = realNow;
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Slow request detected'), expect.objectContaining({ requestId: 'rid' }));
    });

    it('slowRequestLogger does not warn when under threshold', () => {
        const req = mockReq({ id: 'rid' });
        const res = mockRes();

        const mw = slowRequestLogger(999999); // very high threshold
        mw(req, res, next);
        expect(next).toHaveBeenCalled();
        // finish immediately so duration < threshold
        res.finish();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('slowRequestLogger boundary: duration equals threshold -> no warn', () => {
        const req = mockReq({ id: 'rid' });
        const res = mockRes();
        const threshold = 100;
        const mw = slowRequestLogger(threshold);

        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(1_000_000); // start
        nowSpy.mockReturnValueOnce(1_000_000 + threshold); // finish exactly threshold

        mw(req, res, next);
        res.finish();
        expect(logger.warn).not.toHaveBeenCalled();
        nowSpy.mockRestore();
    });

    it('slowRequestLogger boundary: duration greater than threshold -> warn', () => {
        const req = mockReq({ id: 'rid' });
        const res = mockRes();
        const threshold = 100;
        const mw = slowRequestLogger(threshold);

        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(2_000_000); // start
        nowSpy.mockReturnValueOnce(2_000_000 + threshold + 1); // finish just over threshold

        mw(req, res, next);
        res.finish();
        expect(logger.warn).toHaveBeenCalled();
        nowSpy.mockRestore();
    });
});
