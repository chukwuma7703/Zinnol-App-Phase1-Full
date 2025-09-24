import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { postExamScoreToResult } from '../../controllers/examController.js';
import * as StudentExamModel from '../../models/StudentExam.js';
import { updateOrCreateResult } from '../../services/resultService.js';

vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../services/resultService.js', () => ({ __esModule: true, updateOrCreateResult: vi.fn() }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
function mockNext() { return vi.fn(); }

describe('postExamScoreToResult fallback transaction', () => {
    const sessionMock = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn(),
        endSession: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(mongoose, 'startSession').mockResolvedValue(sessionMock);
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('falls back when transaction unsupported and returns 201 on new result', async () => {
        const req = { params: { submissionId: 'sub-pp' }, user: { _id: 'u1', school: 'sch-1' } };
        const res = mockRes();
        const next = mockNext();

        // First call inside try will throw code 20 to trigger fallback
        updateOrCreateResult.mockImplementationOnce(() => { const e = new Error('txn unsupported'); e.code = 20; throw e; })
            .mockResolvedValueOnce({ resultDoc: { _id: 'r1' }, wasNew: true });

        const submission = {
            _id: 'sub-pp', status: 'marked', isPublished: false,
            totalScore: 75,
            exam: { _id: 'ex1', subject: 'subj1', classroom: 'cls1', session: '2023/2024', term: 2, totalMarks: 100 },
            student: { _id: 'stu1', school: 'sch-1' },
            save: vi.fn(),
        };

        // First call within try: submission via .session(transaction) path
        StudentExamModel.default.findById.mockReturnValueOnce({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue(submission) }) });
        // Fallback re-fetch without session
        StudentExamModel.default.findById.mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(submission) });

        await postExamScoreToResult(req, res, next);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalled();
        // Ensure publish flag saved in fallback
        expect(submission.save).toHaveBeenCalled();
    });
});
