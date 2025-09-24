import { vi } from 'vitest';
import {
    createExam,
    getExams,
    getExamSubmissions,
    assignInvigilator,
    removeInvigilator,
    getInvigilators,
    markStudentExam,
    finalizeSubmission,
} from '../../../controllers/examController.js';

import { roles } from '../../../config/roles.js';

// Mock models used by these controllers
vi.mock('../../../models/Classroom.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../models/Subject.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../models/Exam.js', () => ({ __esModule: true, default: { create: vi.fn(), find: vi.fn(), findByIdAndUpdate: vi.fn() } }));
vi.mock('../../../models/StudentExam.js', () => ({ __esModule: true, default: { find: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('../../../models/ExamInvigilator.js', () => ({ __esModule: true, default: { findOne: vi.fn(), create: vi.fn(), deleteOne: vi.fn(), find: vi.fn() } }));
vi.mock('../../../models/userModel.js', () => ({ __esModule: true, default: { findOne: vi.fn() } }));

vi.mock('../../../services/examMarkerService.js', () => ({ __esModule: true, autoMarkSubmission: vi.fn(async id => ({ _id: id, status: 'marked' })) }));

// Pull mocked modules to set expectations
import Classroom from '../../../models/Classroom.js';
import Subject from '../../../models/Subject.js';
import Exam from '../../../models/Exam.js';
import StudentExam from '../../../models/StudentExam.js';
import ExamInvigilator from '../../../models/ExamInvigilator.js';
import User from '../../../models/userModel.js';
import { autoMarkSubmission } from '../../../services/examMarkerService.js';

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
function mockNext() { return vi.fn(); }

beforeEach(() => {
    vi.clearAllMocks();
});

describe('examController remaining endpoints (unit)', () => {
    describe('createExam', () => {
        test('403 when user has no school', async () => {
            const req = { user: { school: null }, body: {} };
            const res = mockRes();
            const next = mockNext();
            await createExam(req, res, next);
            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(403);
        });

        test('404 classroom not found', async () => {
            const req = { user: { school: 'sch1' }, body: { classroom: 'c1', subject: 'sub1' } };
            const res = mockRes();
            const next = mockNext();
            Classroom.findById.mockResolvedValue(null);
            await createExam(req, res, next);
            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(404);
        });

        test('403 classroom different school', async () => {
            const req = { user: { school: 'sch1' }, body: { classroom: 'c1', subject: 'sub1' } };
            const res = mockRes();
            const next = mockNext();
            Classroom.findById.mockResolvedValue({ _id: 'c1', school: 'sch2' });
            Subject.findById.mockResolvedValue({ _id: 'sub1', school: 'sch1' });
            await createExam(req, res, next);
            expect(next).toHaveBeenCalled();
            expect((next.mock.calls[0][0]).statusCode || (next.mock.calls[0][0]).status).toBe(403);
        });

        test('403 subject different school', async () => {
            const req = { user: { school: 'sch1', _id: 'u1' }, body: { classroom: 'c1', subject: 'sub1', title: 'T', session: '2024/2025', term: 1, durationInMinutes: 30, maxPauses: 2 } };
            const res = mockRes();
            const next = mockNext();
            Classroom.findById.mockResolvedValue({ _id: 'c1', school: 'sch1' });
            Subject.findById.mockResolvedValue({ _id: 'sub1', school: 'sch2' });
            await createExam(req, res, next);
            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.statusCode || err.status).toBe(403);
        });

        test('201 success creates exam', async () => {
            const req = { user: { school: 'sch1', _id: 'u1' }, body: { classroom: 'c1', subject: 'sub1', title: 'T', session: '2024/2025', term: 1, durationInMinutes: 30, maxPauses: 2 } };
            const res = mockRes();
            const next = mockNext();
            Classroom.findById.mockResolvedValue({ _id: 'c1', school: 'sch1' });
            Subject.findById.mockResolvedValue({ _id: 'sub1', school: 'sch1' });
            Exam.create.mockResolvedValue({ _id: 'ex1' });
            await createExam(req, res, next);
            expect(Exam.create).toHaveBeenCalledWith(expect.objectContaining({ school: 'sch1', classroom: 'c1', subject: 'sub1' }));
            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    describe('getExams', () => {
        test('returns filtered exams with populate + sort', async () => {
            const req = { user: { school: 'sch1' }, query: { classroom: 'c1', session: '2024/2025', term: 1 } };
            const res = mockRes();
            const next = mockNext();

            const sort = vi.fn().mockResolvedValue([{ _id: 'ex1' }]);
            const populate2 = vi.fn(() => ({ sort }));
            const populate1 = vi.fn(() => ({ populate: populate2 }));
            Exam.find.mockReturnValue({ populate: populate1 });

            await getExams(req, res, next);
            expect(Exam.find).toHaveBeenCalledWith({ school: 'sch1', classroom: 'c1', session: '2024/2025', term: 1 });
            expect(populate1).toHaveBeenCalled();
            expect(populate2).toHaveBeenCalled();
            expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('getExamSubmissions', () => {
        test('returns submissions list with populate + sort', async () => {
            const req = { exam: { _id: 'ex1' } };
            const res = mockRes();
            const next = mockNext();

            const sort = vi.fn().mockResolvedValue([{ _id: 's1' }]);
            const populate = vi.fn(() => ({ sort }));
            StudentExam.find.mockReturnValue({ populate });

            await getExamSubmissions(req, res, next);
            expect(StudentExam.find).toHaveBeenCalledWith({ exam: 'ex1' });
            expect(populate).toHaveBeenCalled();
            expect(sort).toHaveBeenCalledWith({ 'student.lastName': 1 });
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('assign/remove/get invigilators', () => {
        test('assignInvigilator validates teacher and prevents duplicates', async () => {
            const req = { user: { _id: 'admin1' }, exam: { _id: 'ex1', school: 'sch1' }, body: { teacherId: 't1' } };
            const res = mockRes();
            const next = mockNext();

            // teacher not found
            User.findOne.mockResolvedValueOnce(null);
            await assignInvigilator(req, res, next);
            expect(next).toHaveBeenCalled();
            expect((next.mock.calls[0][0]).statusCode || (next.mock.calls[0][0]).status).toBe(404);

            // duplicate assignment
            next.mockReset();
            User.findOne.mockResolvedValueOnce({ _id: 't1', role: roles.TEACHER, school: 'sch1' });
            ExamInvigilator.findOne.mockResolvedValueOnce({ _id: 'assign1' });
            await assignInvigilator(req, res, next);
            expect(res.status).toHaveBeenCalledWith(409);

            // happy path
            res.status.mockClear(); res.json.mockClear(); next.mockReset();
            User.findOne.mockResolvedValueOnce({ _id: 't1', role: roles.TEACHER, school: 'sch1' });
            ExamInvigilator.findOne.mockResolvedValueOnce(null);
            ExamInvigilator.create.mockResolvedValueOnce({ _id: 'assign2' });
            await assignInvigilator(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(ExamInvigilator.create).toHaveBeenCalled();
        });

        test('removeInvigilator 404 then 200', async () => {
            const req = { exam: { _id: 'ex1' }, params: { teacherId: 't1' } };
            const res = mockRes();
            const next = mockNext();

            ExamInvigilator.deleteOne.mockResolvedValueOnce({ deletedCount: 0 });
            await removeInvigilator(req, res, next);
            expect(next).toHaveBeenCalled();
            expect((next.mock.calls[0][0]).statusCode || (next.mock.calls[0][0]).status).toBe(404);

            next.mockReset(); res.status.mockClear(); res.json.mockClear();
            ExamInvigilator.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
            await removeInvigilator(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('getInvigilators returns list', async () => {
            const req = { exam: { _id: 'ex1' } };
            const res = mockRes();
            const next = mockNext();
            ExamInvigilator.find.mockReturnValue({ populate: vi.fn().mockResolvedValue([{ _id: 'a1' }]) });
            await getInvigilators(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Array) }));
        });
    });

    describe('markStudentExam', () => {
        test('404 when submission not found', async () => {
            const req = { params: { submissionId: 's1' } };
            const res = mockRes();
            const next = mockNext();
            StudentExam.findById.mockResolvedValueOnce(null);
            await markStudentExam(req, res, next);
            expect(next).toHaveBeenCalled();
            expect((next.mock.calls[0][0]).statusCode || (next.mock.calls[0][0]).status).toBe(404);
        });

        test('400 when already marked', async () => {
            const req = { params: { submissionId: 's1' } };
            const res = mockRes();
            const next = mockNext();
            StudentExam.findById.mockResolvedValueOnce({ _id: 's1', status: 'marked' });
            await markStudentExam(req, res, next);
            expect(next).toHaveBeenCalled();
            expect((next.mock.calls[0][0]).statusCode || (next.mock.calls[0][0]).status).toBe(400);
        });

        test('400 when not submitted', async () => {
            const req = { params: { submissionId: 's1' } };
            const res = mockRes();
            const next = mockNext();
            StudentExam.findById.mockResolvedValueOnce({ _id: 's1', status: 'in-progress' });
            await markStudentExam(req, res, next);
            expect(next).toHaveBeenCalled();
            expect((next.mock.calls[0][0]).statusCode || (next.mock.calls[0][0]).status).toBe(400);
        });

        test('200 marks using autoMarkSubmission', async () => {
            const req = { params: { submissionId: 's2' } };
            const res = mockRes();
            const next = mockNext();
            StudentExam.findById.mockResolvedValueOnce({ _id: 's2', status: 'submitted' });
            await markStudentExam(req, res, next);
            expect(autoMarkSubmission).toHaveBeenCalledWith('s2');
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('finalizeSubmission happy path', () => {
        test('200 when transitioned to submitted', async () => {
            const req = { params: { submissionId: 's3' }, user: { studentProfile: 'stu1' } };
            const res = mockRes();
            const next = mockNext();

            // first findById for logging/grace check (needs populate chain)
            StudentExam.findById.mockReturnValueOnce({
                populate: vi.fn().mockResolvedValue({ _id: 's3', endTime: new Date(), exam: {} })
            });
            // findOneAndUpdate matches in-progress and returns updated submission
            StudentExam.findOneAndUpdate.mockResolvedValueOnce({ _id: 's3', status: 'submitted' });

            await finalizeSubmission(req, res, next);
            expect(StudentExam.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: 's3', student: 'stu1', status: 'in-progress' },
                { $set: { status: 'submitted' } },
                { new: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });
});
