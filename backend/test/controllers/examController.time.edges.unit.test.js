import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pauseExam, endExam } from '../../controllers/examController.js';
import StudentExam from '../../models/StudentExam.js';
import { roles } from '../../config/roles.js';

vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('../../models/ExamInvigilator.js', () => ({ __esModule: true, default: { findOne: vi.fn().mockResolvedValue(null) } }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
function mockNext() { return vi.fn(); }

describe('examController time edges', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pauseExam 404 when submission missing', async () => {
        const req = { params: { submissionId: 's1' }, user: { role: roles.GLOBAL_SUPER_ADMIN, school: 'sch1' } };
        const res = mockRes();
        const next = mockNext();
        StudentExam.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });
        await pauseExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(404);
    });

    it('pauseExam 400 when not in-progress', async () => {
        const req = { params: { submissionId: 's2' }, user: { role: roles.GLOBAL_SUPER_ADMIN, school: 'sch1' } };
        const res = mockRes();
        const next = mockNext();
        const submission = { _id: 's2', status: 'paused', endTime: new Date(), exam: { _id: 'e1', school: 'sch1' }, save: vi.fn() };
        StudentExam.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(submission) });
        await pauseExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(400);
    });

    it('endExam teacher cannot end before scheduledEndAt', async () => {
        const future = new Date(Date.now() + 60_000);
        const req = { user: { role: roles.TEACHER, _id: 't1' }, exam: { _id: 'ex1', scheduledEndAt: future } };
        const res = mockRes();
        const next = mockNext();
        await endExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(403);
    });
});
