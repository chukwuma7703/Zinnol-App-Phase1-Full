import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    bulkPublishExamScores,
    postExamScoreToResult,
    addQuestionToExam,
    startExam,
    beginExam,
    resumeExam,
    submitAnswer,
    overrideAnswerScore,
} from '../../controllers/examController.js';

import { roles } from '../../config/roles.js';
import StudentExam from '../../models/StudentExam.js';
import Exam from '../../models/Exam.js';
import Student from '../../models/Student.js';
import Question from '../../models/Question.js';
import mongoose from 'mongoose';

// Mocks for models and mongoose session
vi.mock('mongoose', () => {
    // Minimal mongoose mock compatible with model/schema usage at module load
    const virtual = vi.fn(() => ({ get: vi.fn(), set: vi.fn() }));
    const pre = vi.fn();
    const index = vi.fn();
    function Schema() {
        this.virtual = virtual;
        this.pre = pre;
        this.statics = {};
        this.methods = {};
        this.index = index;
        this.plugin = vi.fn();
    }
    Schema.Types = { ObjectId: function ObjectId() { } };
    const model = vi.fn(() => ({}));

    // Create a session mock where starting a transaction is unsupported
    const session = {
        startTransaction: vi.fn(() => { const e = new Error('IllegalOperation'); e.code = 20; e.codeName = 'IllegalOperation'; throw e; }),
        abortTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        endSession: vi.fn(),
    };

    return {
        __esModule: true,
        default: {
            Schema,
            model,
            startSession: vi.fn(() => session)
        },
        Schema,
        model,
        startSession: vi.fn(() => session)
    };
});

vi.mock('../../models/StudentExam.js', () => ({
    __esModule: true, default: {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        updateOne: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
    }
}));

vi.mock('../../models/Exam.js', () => ({
    __esModule: true, default: {
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
    }
}));

vi.mock('../../models/Student.js', () => ({
    __esModule: true, default: {
        findById: vi.fn(),
    }
}));

vi.mock('../../models/Question.js', () => ({
    __esModule: true, default: {
        find: vi.fn(),
        create: vi.fn(),
    }
}));

// services used inside bulk publish
vi.mock('../../services/resultService.js', () => ({
    __esModule: true, bulkUpdateOrCreateResults: vi.fn(async (updates) => ({
        errors: [],
    })), updateOrCreateResult: vi.fn(async () => ({ resultDoc: { _id: 'r1' }, wasNew: true }))
}));

// cache helpers used in bulk publish
vi.mock('../../config/cache.js', () => ({
    __esModule: true,
    getCachedStudentResults: vi.fn(async () => new Map()),
    cacheStudentResults: vi.fn(async () => { }),
    invalidateStudentResultCache: vi.fn(async () => { })
}));

// Result model used by bulk publish
vi.mock('../../models/Result.js', () => ({ __esModule: true, default: { find: vi.fn().mockResolvedValue([]) } }));

// Static imports above are used instead of dynamic top-level await

function mockRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}
function mockNext() { return vi.fn(); }

beforeEach(() => {
    vi.clearAllMocks();
});

describe('examController additional coverage', () => {
    it('bulkPublishExamScores returns 200 when no submissions', async () => {
        const req = { exam: { _id: 'ex1', session: '2024/2025', term: 1 }, user: { _id: 'u1' }, startTime: Date.now() };
        const res = mockRes();
        const next = mockNext();

        StudentExam.find.mockReturnValue({ populate: vi.fn().mockResolvedValue([]) });

        await bulkPublishExamScores(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No marked, unpublished') }));
    });

    describe('postExamScoreToResult negative branches', () => {
        const baseReq = { params: { submissionId: 's1' }, user: { _id: 't1', school: 'sch1' } };
        const res = mockRes();

        function setFindByIdWithSubmission(sub) {
            const query = {
                session: () => Promise.resolve(sub),
                then: (resolve, reject) => Promise.resolve(sub).then(resolve, reject),
                catch: (reject) => Promise.resolve(sub).catch(reject),
            };
            const chain = {
                populate: () => query,
            };
            StudentExam.findById.mockReturnValue(chain);
        }

        it('returns 400 when submission not marked', async () => {
            const next = mockNext();
            const submission = { _id: 's1', status: 'submitted', isPublished: false, exam: { subject: 'sub1' }, student: { school: 'sch1', _id: 'st1' }, totalScore: 50 };
            setFindByIdWithSubmission(submission);

            await postExamScoreToResult(baseReq, res, next);

            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(400);
        });

        it('returns 400 when already published', async () => {
            const next = mockNext();
            const submission = { _id: 's1', status: 'marked', isPublished: true, exam: { subject: 'sub1' }, student: { school: 'sch1', _id: 'st1' }, totalScore: 50 };
            setFindByIdWithSubmission(submission);
            await postExamScoreToResult(baseReq, res, next);
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(400);
        });

        it('returns 400 when exam subject missing', async () => {
            const next = mockNext();
            const submission = { _id: 's1', status: 'marked', isPublished: false, exam: { subject: null }, student: { school: 'sch1', _id: 'st1' }, totalScore: 50 };
            setFindByIdWithSubmission(submission);
            await postExamScoreToResult(baseReq, res, next);
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(400);
        });

        it('returns 403 when school mismatch', async () => {
            const next = mockNext();
            const submission = { _id: 's1', status: 'marked', isPublished: false, exam: { subject: 'sub1' }, student: { school: 'sch2', _id: 'st1' }, totalScore: 50 };
            setFindByIdWithSubmission(submission);
            await postExamScoreToResult(baseReq, res, next);
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(403);
        });
    });

    describe('addQuestionToExam fallback without transactions', () => {
        it('creates question and updates exam when transactions unsupported', async () => {
            const req = { exam: { _id: 'ex1' }, body: { questionText: 'Q1', questionType: 'objective', marks: 5, options: ['a', 'b'], correctOptionIndex: 1 } };
            const res = mockRes();
            const next = mockNext();

            const created = { _id: 'q1', exam: 'ex1' };
            const QuestionMod = Question;
            QuestionMod.create.mockResolvedValue(created);
            const ExamMod = Exam;
            ExamMod.findByIdAndUpdate.mockResolvedValue({ _id: 'ex1', totalMarks: 5 });

            await addQuestionToExam(req, res, next);

            expect(QuestionMod.create).toHaveBeenCalledWith(expect.objectContaining({ exam: 'ex1', marks: 5 }));
            expect(ExamMod.findByIdAndUpdate).toHaveBeenCalledWith('ex1', { $inc: { totalMarks: 5 } }, { new: true });
            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    describe('startExam paths', () => {
        it('returns 403 when student classroom mismatch', async () => {
            const req = { params: { examId: 'ex2' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            Exam.findById.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'ex2', classroom: 'c1', session: '2024/2025', term: 1 }) });
            Student.findById.mockResolvedValue({ _id: 'stu1', classroom: 'c2' });

            await startExam(req, res, next);

            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(403);
        });

        it('creates new submission and returns questions', async () => {
            const req = { params: { examId: 'ex2' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            Exam.findById.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'ex2', classroom: 'c1', session: '2024/2025', term: 1 }) });
            Student.findById.mockResolvedValue({ _id: 'stu1', classroom: 'c1' });
            StudentExam.findOne.mockResolvedValue(null);

            const createdSubmission = { _id: 'sub-new', status: 'ready', populate: vi.fn().mockResolvedValue(null) };
            StudentExam.create.mockResolvedValue(createdSubmission);

            Question.find.mockReturnValue({ select: vi.fn().mockResolvedValue([{ _id: 'q1', questionText: '...' }]) });

            await startExam(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Ready to begin') }));
        });

        it('returns 400 when already submitted', async () => {
            const req = { params: { examId: 'ex2' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            Exam.findById.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'ex2', classroom: 'c1', session: '2024/2025', term: 1 }) });
            Student.findById.mockResolvedValue({ _id: 'stu1', classroom: 'c1' });
            StudentExam.findOne.mockResolvedValue({ _id: 'sub-exists', status: 'submitted' });

            await startExam(req, res, next);

            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(400);
        });
    });

    describe('submitAnswer update path', () => {
        it('updates existing answer atomically', async () => {
            const req = { params: { submissionId: 'sub1' }, body: { questionId: 'q1', answerText: 'A' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            StudentExam.findById.mockResolvedValue({ _id: 'sub1', student: 'stu1', status: 'in-progress', answers: [{ question: 'q1', answerText: 'X' }] });

            await submitAnswer(req, res, next);

            expect(StudentExam.updateOne).toHaveBeenCalledWith({ _id: 'sub1', 'answers.question': 'q1' }, { $set: { 'answers.$.answerText': 'A', 'answers.$.selectedOptionIndex': undefined } });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('pushes new answer when not exists', async () => {
            const req = { params: { submissionId: 'sub1' }, body: { questionId: 'q2', answerText: 'B' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            StudentExam.findById.mockResolvedValue({ _id: 'sub1', student: 'stu1', status: 'in-progress', answers: [{ question: 'q1', answerText: 'X' }] });

            await submitAnswer(req, res, next);

            expect(StudentExam.updateOne).toHaveBeenCalledWith({ _id: 'sub1' }, { $push: { answers: { question: 'q2', answerText: 'B', selectedOptionIndex: undefined } } });
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('begin/resume happy paths', () => {
        it('beginExam transitions ready -> in-progress and sets times', async () => {
            const req = { params: { submissionId: 'sub-begin' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            const examDoc = { durationInMinutes: 30 };
            const submission = {
                _id: 'sub-begin',
                status: 'ready',
                exam: examDoc,
                save: vi.fn().mockResolvedValue(true),
            };

            StudentExam.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(submission) });

            await beginExam(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(submission.status).toBe('in-progress');
            expect(submission.startTime instanceof Date).toBe(true);
            expect(submission.endTime instanceof Date).toBe(true);
            expect(submission.save).toHaveBeenCalled();
        });

        it('resumeExam transitions paused -> in-progress and recomputes endTime', async () => {
            const fixedNow = 1_000_000;
            vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

            const req = { params: { submissionId: 'sub-resume' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            const submission = {
                _id: 'sub-resume',
                student: 'stu1',
                status: 'paused',
                timeRemainingOnPause: 60_000,
                save: vi.fn().mockResolvedValue(true),
            };

            StudentExam.findOne.mockResolvedValue(submission);

            await resumeExam(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(submission.status).toBe('in-progress');
            expect(submission.endTime.getTime()).toBe(fixedNow + 60_000);
            expect(submission.timeRemainingOnPause).toBeUndefined();
            expect(submission.save).toHaveBeenCalled();

            // restore
            Date.now.mockRestore();
        });
    });
    describe('overrideAnswerScore validation', () => {
        it('rejects non-number newScore with 400', async () => {
            const req = { params: { submissionId: 's1', answerId: 'a1' }, body: { newScore: 'bad', reason: 'x' } };
            const res = mockRes();
            const next = mockNext();

            await overrideAnswerScore(req, res, next);

            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(400);
        });

        it('overrides answer score and recalculates total (200)', async () => {
            const req = { params: { submissionId: 'sub-1', answerId: 'ans-1' }, body: { newScore: 7, reason: 'regrade' }, user: { _id: 'teacher-1' } };
            const res = mockRes();
            const next = mockNext();

            // Build a submission with one answer and required shape
            const answer = { _id: 'ans-1', question: { marks: 10 }, awardedMarks: 3 };
            const answersArray = [answer];
            // answers.id(...) should return the subdoc
            answersArray.id = (id) => (id === 'ans-1' ? answer : null);
            const submission = {
                _id: 'sub-1',
                status: 'marked',
                answers: answersArray,
                save: vi.fn().mockResolvedValue(true),
            };

            // Mock StudentExam.findById().populate('answers.question') to resolve to submission
            StudentExam.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue(submission),
            });

            await overrideAnswerScore(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Score overridden successfully') }));
            expect(submission.save).toHaveBeenCalled();
            expect(answer.awardedMarks).toBe(7);
            // totalScore should be sum of awardedMarks across answers (only one here)
            expect(submission.totalScore).toBe(7);
        });

        it('rejects when submission is not marked (400)', async () => {
            const req = { params: { submissionId: 'sub-2', answerId: 'ans-x' }, body: { newScore: 5, reason: 'nope' } };
            const res = mockRes();
            const next = mockNext();

            // submission exists but status is not 'marked'
            StudentExam.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue({ _id: 'sub-2', status: 'submitted' })
            });

            await overrideAnswerScore(req, res, next);

            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(400);
        });

        it('returns 404 when answer not found within submission', async () => {
            const req = { params: { submissionId: 'sub-3', answerId: 'ans-missing' }, body: { newScore: 2, reason: 'x' }, user: { _id: 't1' } };
            const res = mockRes();
            const next = mockNext();

            const answersArray = [];
            answersArray.id = () => null; // simulate missing answer
            const submission = { _id: 'sub-3', status: 'marked', answers: answersArray };

            StudentExam.findById.mockReturnValue({ populate: vi.fn().mockResolvedValue(submission) });

            await overrideAnswerScore(req, res, next);

            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(404);
        });
    });
});
