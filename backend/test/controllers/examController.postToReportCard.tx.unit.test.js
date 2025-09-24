import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { postExamScoreToResult } from '../../controllers/examController.js';
import StudentExam from '../../models/StudentExam.js';
import { updateOrCreateResult } from '../../services/resultService.js';

// Mock mongoose with transaction-supported session
vi.mock('mongoose', () => {
    const session = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn(),
        endSession: vi.fn(),
    };
    // Minimal Schema stub to satisfy model definitions at import time
    function Schema() {
        this.methods = {};
        this.statics = {};
    }
    Schema.prototype.virtual = function () {
        const chain = { get: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis() };
        return chain;
    };
    Schema.prototype.pre = vi.fn();
    Schema.prototype.post = vi.fn();
    Schema.prototype.index = vi.fn();
    Schema.prototype.plugin = vi.fn();
    const Types = { ObjectId: function ObjectId() { } };
    Schema.Types = Types;
    const model = vi.fn(() => ({}));
    return {
        __esModule: true,
        default: { startSession: vi.fn(() => session), Schema, model, Types },
        startSession: vi.fn(() => session),
        Schema,
        model,
        Types,
    };
});

vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../services/resultService.js', () => ({ __esModule: true, updateOrCreateResult: vi.fn() }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
function mockNext() { return vi.fn(); }

describe('postExamScoreToResult transaction success path', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses transaction session and returns 200 when wasNew=false', async () => {
        const req = { params: { submissionId: 'sub-tx-1' }, user: { _id: 'teacher-1', school: 'sch1' } };
        const res = mockRes();
        const next = mockNext();

        const submission = {
            _id: 'sub-tx-1',
            status: 'marked',
            isPublished: false,
            exam: { session: '2024/2025', term: 1, subject: 'sub1', classroom: 'cls1', totalMarks: 100 },
            student: { _id: 'stu1', school: 'sch1' },
            totalScore: 80,
            save: vi.fn().mockResolvedValue(true),
        };

        // Mock findById().populate().session(session) chain resolving to submission
        const chain = { populate: vi.fn(() => ({ session: vi.fn(async () => submission) })) };
        StudentExam.findById.mockReturnValue(chain);
        updateOrCreateResult.mockResolvedValue({ resultDoc: { _id: 'r1' }, wasNew: false });

        await postExamScoreToResult(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { _id: 'r1' } }));
        expect(submission.save).toHaveBeenCalledWith(expect.objectContaining({ session: expect.any(Object) }));
    });
});
