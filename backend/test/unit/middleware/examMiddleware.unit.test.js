import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/Exam.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../utils/AppError.js', () => ({ __esModule: true, default: class AppError extends Error { constructor(m, s) { super(m); this.statusCode = s; } } }));
vi.mock('../../../config/roles.js', () => ({ __esModule: true, roles: { GLOBAL_SUPER_ADMIN: 'GLOBAL_SUPER_ADMIN' } }));

import Exam from '../../../models/Exam.js';
import AppError from '../../../utils/AppError.js';
import { roles } from '../../../config/roles.js';
import { checkExamAccess } from '../../../middleware/examMiddleware.js';

const make = () => ({ req: { params: {}, user: {} }, res: {}, next: vi.fn() });

describe('middleware/examMiddleware.checkExamAccess', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects invalid exam id format', async () => {
        const { req, res, next } = make();
        req.params.examId = 'not-an-id';
        await checkExamAccess(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(400);
        expect(err.message).toBe('Invalid Exam ID format');
    });

    it('404 when exam not found', async () => {
        const { req, res, next } = make();
        req.params.examId = '507f1f77bcf86cd799439011';
        Exam.findById.mockResolvedValue(null);
        await checkExamAccess(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(404);
        expect(err.message).toBe('Exam not found');
    });

    it('allows GLOBAL_SUPER_ADMIN regardless of school', async () => {
        const { req, res, next } = make();
        req.params.examId = '507f1f77bcf86cd799439011';
        req.user = { role: roles.GLOBAL_SUPER_ADMIN };
        const examDoc = { _id: req.params.examId, school: 'sch1' };
        Exam.findById.mockResolvedValue(examDoc);
        await checkExamAccess(req, res, next);
        expect(req.exam).toBe(examDoc);
        expect(next).toHaveBeenCalled();
        expect(next.mock.calls[0][0]).toBeUndefined();
    });

    it('forbids when user.school mismatch', async () => {
        const { req, res, next } = make();
        req.params.examId = '507f1f77bcf86cd799439011';
        req.user = { role: 'TEACHER', school: 'schA' };
        const examDoc = { _id: req.params.examId, school: 'schB' };
        Exam.findById.mockResolvedValue(examDoc);
        await checkExamAccess(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(403);
        expect(err.message).toBe('Forbidden: You do not have access to this exam.');
    });

    it('allows when user.school matches', async () => {
        const { req, res, next } = make();
        req.params.examId = '507f1f77bcf86cd799439011';
        req.user = { role: 'TEACHER', school: 'sch1' };
        const examDoc = { _id: req.params.examId, school: 'sch1' };
        Exam.findById.mockResolvedValue(examDoc);
        await checkExamAccess(req, res, next);
        expect(req.exam).toBe(examDoc);
        expect(next).toHaveBeenCalled();
        expect(next.mock.calls[0][0]).toBeUndefined();
    });

    it('supports req.params.id fallback', async () => {
        const { req, res, next } = make();
        req.params.id = '507f1f77bcf86cd799439022';
        req.user = { role: 'TEACHER', school: 'sch2' };
        const examDoc = { _id: req.params.id, school: 'sch2' };
        Exam.findById.mockResolvedValue(examDoc);
        await checkExamAccess(req, res, next);
        expect(Exam.findById).toHaveBeenCalledWith(req.params.id);
        expect(req.exam).toBe(examDoc);
        expect(next).toHaveBeenCalled();
    });
});
