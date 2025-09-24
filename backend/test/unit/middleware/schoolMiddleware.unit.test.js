import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/School.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../models/userModel.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));

import School from '../../../models/School.js';
import User from '../../../models/userModel.js';
import { checkSchoolAccess, checkStudentAccess } from '../../../middleware/schoolMiddleware.js';
import AppError from '../../../utils/AppError.js';
import { roles } from '../../../config/roles.js';

const make = () => ({ req: { params: {}, user: {} }, res: {}, next: vi.fn() });

describe('middleware/schoolMiddleware', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('checkSchoolAccess', () => {
        it('404 when school not found', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { role: roles.GLOBAL_SUPER_ADMIN };
            School.findById.mockResolvedValue(null);
            await checkSchoolAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(404);
            expect(next.mock.calls[0][0].message).toBe('School not found');
        });

        it('allows GLOBAL_SUPER_ADMIN for any school', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'u1', role: roles.GLOBAL_SUPER_ADMIN };
            const school = { _id: '507f1f77bcf86cd799439011', mainSuperAdmins: ['owner1'] };
            School.findById.mockResolvedValue(school);
            await checkSchoolAccess(req, res, next);
            expect(req.school).toBe(school);
            expect(next).toHaveBeenCalled();
        });

        it('allows MAIN_SUPER_ADMIN when owner', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'owner1', role: roles.MAIN_SUPER_ADMIN, school: 'school1' };
            const school = { _id: '507f1f77bcf86cd799439011', mainSuperAdmins: ['owner1'] };
            School.findById.mockResolvedValue(school);
            await checkSchoolAccess(req, res, next);
            expect(req.school).toBe(school);
            expect(next).toHaveBeenCalled();
        });

        it('forbids MAIN_SUPER_ADMIN when not owner', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'ownerX', role: roles.MAIN_SUPER_ADMIN, school: 'school1' };
            const school = { _id: '507f1f77bcf86cd799439011', mainSuperAdmins: ['owner1'] };
            School.findById.mockResolvedValue(school);
            await checkSchoolAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(403);
        });

        it('forbids other roles when accessing different school', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'u2', role: 'PRINCIPAL', school: 'school2' };
            const school = { _id: '507f1f77bcf86cd799439011', mainSuperAdmins: [] };
            School.findById.mockResolvedValue(school);
            await checkSchoolAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(403);
        });

        it('allows other roles when accessing their own school', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'u3', role: 'PRINCIPAL', school: '507f1f77bcf86cd799439011' };
            const school = { _id: '507f1f77bcf86cd799439011', mainSuperAdmins: [] };
            School.findById.mockResolvedValue(school);
            await checkSchoolAccess(req, res, next);
            expect(req.school).toBe(school);
            expect(next).toHaveBeenCalled();
        });
    });

    describe('checkStudentAccess', () => {
        it('500 if checkSchoolAccess not executed first', async () => {
            const { req, res, next } = make();
            req.params.studentId = 'stu1';
            await checkStudentAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(500);
            expect(err.message).toContain('checkSchoolAccess must be used before checkStudentAccess');
        });

        it('404 when student not found', async () => {
            const { req, res, next } = make();
            // Prime school
            req.params.id = 'school1';
            req.user = { _id: 'u1', role: 'PRINCIPAL', school: 'school1' };
            School.findById.mockResolvedValue({ _id: 'school1', mainSuperAdmins: [] });
            await checkSchoolAccess(req, res, next);
            // Now student check
            next.mockClear(); // clear previous next calls
            req.params.studentId = 'stuX';
            User.findById.mockResolvedValue(null);
            await checkStudentAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(404);
            expect(err.message).toBe('Student not found in this school.');
        });

        it('404 when student not found', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'u1', role: 'PRINCIPAL', school: '507f1f77bcf86cd799439011' };
            School.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', mainSuperAdmins: [] });
            await checkSchoolAccess(req, res, next);
            next.mockClear();
            req.params.studentId = '507f1f77bcf86cd799439012';
            User.findById.mockResolvedValue(null);
            await checkStudentAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(404);
            expect(err.message).toBe('Student not found in this school.');
        });

        it('404 when student belongs to different school', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'u1', role: 'PRINCIPAL', school: '507f1f77bcf86cd799439011' };
            School.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', mainSuperAdmins: [] });
            await checkSchoolAccess(req, res, next);
            next.mockClear();
            req.params.studentId = '507f1f77bcf86cd799439012';
            User.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439012', school: 'school2' });
            await checkStudentAccess(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(404);
            expect(err.message).toBe('Student not found in this school.');
        });

        it('passes when student belongs to the school', async () => {
            const { req, res, next } = make();
            req.params.id = '507f1f77bcf86cd799439011';
            req.user = { _id: 'u1', role: 'PRINCIPAL', school: '507f1f77bcf86cd799439011' };
            School.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439011', mainSuperAdmins: [] });
            await checkSchoolAccess(req, res, next);
            next.mockClear();
            req.params.studentId = '507f1f77bcf86cd799439012';
            const student = { _id: '507f1f77bcf86cd799439012', school: '507f1f77bcf86cd799439011' };
            User.findById.mockResolvedValue(student);
            await checkStudentAccess(req, res, next);
            expect(req.student).toBe(student);
            expect(next).toHaveBeenCalled();
            expect(next.mock.calls[0][0]).toBeUndefined();
        });

        it('passes when student belongs to the school', async () => {
            const { req, res, next } = make();
            req.params.id = 'school1';
            req.user = { _id: 'u1', role: 'PRINCIPAL', school: 'school1' };
            School.findById.mockResolvedValue({ _id: 'school1', mainSuperAdmins: [] });
            await checkSchoolAccess(req, res, next);
            next.mockClear();
            req.params.studentId = 'stu1';
            const student = { _id: 'stu1', school: 'school1' };
            User.findById.mockResolvedValue(student);
            await checkStudentAccess(req, res, next);
            expect(req.student).toBe(student);
            expect(next).toHaveBeenCalled();
            expect(next.mock.calls[0][0]).toBeUndefined();
        });
    });
});
