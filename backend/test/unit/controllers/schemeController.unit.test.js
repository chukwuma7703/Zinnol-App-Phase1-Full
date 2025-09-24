import { createScheme } from '../../../controllers/schemeController.js';
import SchemeOfWork from '../../../models/SchemeOfWork.js';
import { vi } from 'vitest';

vi.mock('../../../models/SchemeOfWork.js', () => {
    const actual = vi.importActual('../../../models/SchemeOfWork.js');
    return {
        __esModule: true,
        default: { create: vi.fn(async (data) => ({ _id: 'scheme123', progress: 0, ...data })) },
    };
});

describe('schemeController.createScheme', () => {
    const makeReqRes = (body = {}, user = {}) => {
        const req = { body, user: { _id: 'u1', role: 'TEACHER', school: 'school1', ...user } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
        const next = vi.fn();
        return { req, res, next };
    };

    it('validates required fields', async () => {
        const { req, res, next } = makeReqRes({});
        await createScheme(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err).toBeTruthy();
        // Allow generic Error or ValidationError; assert message contains key phrase
        expect(['ValidationError', 'Error']).toContain(err.name);
        expect(err.message).toMatch(/validation/i);
    });

    it('creates scheme successfully', async () => {
        const body = { subject: '507f1f77bcf86cd799439011', classroom: '507f1f77bcf86cd799439012', session: '2025/2026', term: '1', title: 'Math Scheme' };
        const { req, res, next } = makeReqRes(body);
        await createScheme(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.data.scheme.title).toBe('Math Scheme');
    });
});
