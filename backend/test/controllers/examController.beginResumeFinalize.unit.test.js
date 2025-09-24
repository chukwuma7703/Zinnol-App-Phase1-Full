import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { beginExam, resumeExam, finalizeSubmission } from '../../controllers/examController.js';
import * as StudentExamModel from '../../models/StudentExam.js';
import * as ExamModel from '../../models/Exam.js';
import * as StudentModel from '../../models/Student.js';

vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: { findOne: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('../../models/Exam.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../models/Student.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
function mockNext() { return vi.fn(); }

describe('examController begin/resume/finalize negative paths', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('beginExam 404 when submission not found for student', async () => {
        const req = { params: { submissionId: 'sub-x' }, user: { studentProfile: 'stu-x' } };
        const res = mockRes();
        const next = mockNext();

        // findOne().populate() resolves to null
        StudentExamModel.default.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });

        await beginExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(404);
    });

    it('beginExam 400 when submission not in ready state', async () => {
        const req = { params: { submissionId: 'sub-y' }, user: { studentProfile: 'stu-y' } };
        const res = mockRes();
        const next = mockNext();
        const submission = { _id: 'sub-y', status: 'in-progress', exam: { durationInMinutes: 30 }, save: vi.fn() };
        StudentExamModel.default.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(submission) });

        await beginExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(400);
    });

    it('resumeExam 404 when submission not found', async () => {
        const req = { params: { submissionId: 'sub-z' }, user: { studentProfile: 'stu-z' } };
        const res = mockRes();
        const next = mockNext();
        StudentExamModel.default.findOne.mockResolvedValue(null);

        await resumeExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(404);
    });

    it('resumeExam 400 when submission not paused', async () => {
        const req = { params: { submissionId: 'sub-z2' }, user: { studentProfile: 'stu-z2' } };
        const res = mockRes();
        const next = mockNext();
        StudentExamModel.default.findOne.mockResolvedValue({ _id: 'sub-z2', status: 'in-progress', timeRemainingOnPause: 0, save: vi.fn() });

        await resumeExam(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(400);
    });

    it('finalizeSubmission 404 when submission to check not found', async () => {
        const req = { params: { submissionId: 'final-1' }, user: { studentProfile: 'stu-a' } };
        const res = mockRes();
        const next = mockNext();
        StudentExamModel.default.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });

        await finalizeSubmission(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(404);
    });

    it('finalizeSubmission 404 when update returns null (already finalized or not owner)', async () => {
        const req = { params: { submissionId: 'final-2' }, user: { studentProfile: 'stu-b' } };
        const res = mockRes();
        const next = mockNext();
        StudentExamModel.default.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue({ _id: 'final-2', exam: {}, endTime: null }) });
        StudentExamModel.default.findOneAndUpdate.mockResolvedValue(null);

        await finalizeSubmission(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(404);
    });
});
