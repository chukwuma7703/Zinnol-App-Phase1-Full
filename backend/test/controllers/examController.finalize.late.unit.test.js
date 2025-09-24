import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { finalizeSubmission } from '../../controllers/examController.js';
import StudentExam from '../../models/StudentExam.js';

vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: { findById: vi.fn(), findOneAndUpdate: vi.fn() } }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
function mockNext() { return vi.fn(); }

describe('finalizeSubmission late branch', () => {
    beforeEach(() => vi.clearAllMocks());

    it('logs late submission and still finalizes', async () => {
        const past = new Date(Date.now() - 31_000); // 31s ago -> triggers late branch
        const req = { params: { submissionId: 's-late' }, user: { studentProfile: 'stu1' } };
        const res = mockRes();
        const next = mockNext();

        StudentExam.findById.mockReturnValueOnce({
            populate: vi.fn().mockResolvedValue({ _id: 's-late', endTime: past, exam: {} })
        });

        StudentExam.findOneAndUpdate.mockResolvedValueOnce({ _id: 's-late', status: 'submitted' });

        await finalizeSubmission(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalled();
    });
});
