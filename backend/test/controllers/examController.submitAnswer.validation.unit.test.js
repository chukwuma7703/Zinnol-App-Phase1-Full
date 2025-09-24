import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { submitAnswer } from '../../controllers/examController.js';

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn() }; }
function mockNext() { return vi.fn(); }

describe('submitAnswer validation', () => {
    it('returns 400 when questionId or answer missing', async () => {
        const req = { params: { submissionId: 'sub1' }, body: { questionId: null }, user: { studentProfile: 'stu1' } };
        const res = mockRes();
        const next = mockNext();

        await submitAnswer(req, res, next);

        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(400);
    });
});
