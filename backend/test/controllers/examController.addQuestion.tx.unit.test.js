import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/cache.js', () => ({ __esModule: true, cacheStudentResults: vi.fn(), getCachedStudentResults: vi.fn(), invalidateStudentResultCache: vi.fn() }));
vi.mock('../../services/examMarkerService.js', () => ({ __esModule: true, autoMarkSubmission: vi.fn() }));
vi.mock('../../config/socket.js', () => ({ __esModule: true, getIO: vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })), emit: vi.fn() })) }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn() }; }
function mockNext() { return vi.fn(); }

vi.mock('mongoose', () => {
    const session = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn(),
        endSession: vi.fn(),
    };
    // Minimal chainable virtual().get() and index()
    function Schema() { this.statics = {}; }
    Schema.prototype.pre = vi.fn();
    Schema.prototype.virtual = vi.fn(() => ({ get: vi.fn(() => { }) }));
    Schema.prototype.index = vi.fn();
    Schema.prototype.plugin = vi.fn();
    Schema.prototype.post = vi.fn();
    Schema.Types = { ObjectId: function ObjectId() { } };
    const model = vi.fn(() => ({}));
    return { __esModule: true, default: { startSession: vi.fn(() => session), Schema, model }, startSession: vi.fn(() => session), Schema, model };
});

vi.mock('../../models/Question.js', () => ({ __esModule: true, default: { create: vi.fn(async (arr, opts) => [{ _id: 'q1', ...arr[0] }]) } }));
vi.mock('../../models/Exam.js', () => ({ __esModule: true, default: { findByIdAndUpdate: vi.fn(async () => ({ _id: 'ex1', totalMarks: 10 })) } }));
// Stub other models imported by examController to avoid executing their schema code
vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../models/Student.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../models/Classroom.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../models/Subject.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../models/Result.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../models/ExamInvigilator.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../models/userModel.js', () => ({ __esModule: true, default: {} }));
vi.mock('../../services/resultService.js', () => ({ __esModule: true, updateOrCreateResult: vi.fn(), bulkUpdateOrCreateResults: vi.fn() }));
vi.mock('../../config/cache.js', () => ({ __esModule: true, cacheStudentResults: vi.fn(), getCachedStudentResults: vi.fn(), invalidateStudentResultCache: vi.fn() }));
vi.mock('../../services/examMarkerService.js', () => ({ __esModule: true, autoMarkSubmission: vi.fn() }));
vi.mock('../../config/socket.js', () => ({ __esModule: true, getIO: vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })), emit: vi.fn() })) }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn() }; }
function mockNext() { return vi.fn(); }

describe('addQuestionToExam transaction success', () => {
    it('uses session and commits when supported', async () => {
        const { addQuestionToExam } = await import('../../controllers/examController.js');
        const req = { exam: { _id: 'ex1' }, body: { questionText: 'Q', questionType: 'objective', marks: 10, options: ['a', 'b'], correctOptionIndex: 1 } };
        const res = mockRes();
        const next = mockNext();

        await addQuestionToExam(req, res, next);

        expect(res.status).toHaveBeenCalledWith(201);
    });
});
