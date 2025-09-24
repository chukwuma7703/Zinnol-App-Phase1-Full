import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../../../models/userModel.js', () => ({ default: { findById: vi.fn() } }));
import User from '../../../models/userModel.js';

vi.mock('jsonwebtoken', () => ({ default: { verify: vi.fn() } }));
import jwt from 'jsonwebtoken';

import { protect, protectMfa, authorizeRoles, authorizeGlobalAdmin } from '../../../middleware/authMiddleware.js';
import AppError from '../../../utils/AppError.js';
import { roles } from '../../../config/roles.js';

describe('middleware/authMiddleware (unit)', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {}, body: {}, params: {}, query: {} };
        res = {};
        next = vi.fn();
        process.env.JWT_SECRET = 'test-secret';
        vi.clearAllMocks();
        User.findById.mockClear();
        jwt.verify.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('protect', () => {
        it('calls next with 401 when token missing', async () => {
            await protect(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, no token provided.');
        });

        it('handles expired token with 401 and session expired message', async () => {
            jwt.verify.mockImplementation(() => {
                throw { name: 'TokenExpiredError', message: 'jwt expired' };
            });
            req.headers.authorization = 'Bearer expired.token';

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Session expired. Please log in again.');
        });

        it('handles malformed/invalid token with 401 verification failed', async () => {
            jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });
            req.headers.authorization = 'Bearer bad.token.here';

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, token failed verification.');
        });

        it('authenticates valid token and active user (success path)', async () => {
            const userId = '507f1f77bcf86cd799439011';
            jwt.verify.mockReturnValue({ id: userId, tokenVersion: 1 });
            req.headers.authorization = 'Bearer good.token';

            const mockUser = { _id: userId, role: 'TEACHER', isActive: true, tokenVersion: 1, school: 'sch1' };
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

            await protect(req, res, next);

            expect(User.findById).toHaveBeenCalledWith(userId);
            expect(req.user).toEqual(mockUser);
            expect(next).toHaveBeenCalled();
            expect(next.mock.calls[0][0]).toBeUndefined();
        });

        it('rejects when tokenVersion mismatches (force logout scenario)', async () => {
            const userId = '507f1f77bcf86cd799439011';
            jwt.verify.mockReturnValue({ id: userId, tokenVersion: 1 });
            req.headers.authorization = 'Bearer good.token';

            const mockUser = { _id: userId, role: 'TEACHER', isActive: true, tokenVersion: 2, school: 'sch1' };
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Session expired. Please log in again.');
        });

        it('handles malformed/invalid token with 401 verification failed', async () => {
            jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });
            req.headers.authorization = 'Bearer bad.token.here';

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, token failed verification.');
        });

        it('authenticates valid token and active user (success path)', async () => {
            const userId = '507f1f77bcf86cd799439011';
            jwt.verify.mockReturnValue({ id: userId, tokenVersion: 1 });
            req.headers.authorization = 'Bearer good.token';

            const mockUser = { _id: userId, role: 'TEACHER', isActive: true, tokenVersion: 1, school: 'sch1' };
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

            await protect(req, res, next);

            expect(User.findById).toHaveBeenCalledWith(userId);
            expect(req.user).toEqual(mockUser);
            expect(next).toHaveBeenCalled();
            expect(next.mock.calls[0][0]).toBeUndefined();
        });

        it('rejects when tokenVersion mismatches (force logout scenario)', async () => {
            const userId = '507f1f77bcf86cd799439011';
            jwt.verify.mockReturnValue({ id: userId, tokenVersion: 1 });
            req.headers.authorization = 'Bearer good.token';

            const mockUser = { _id: userId, role: 'TEACHER', isActive: true, tokenVersion: 2, school: 'sch1' };
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Session expired. Please log in again.');
        });

        it('rejects inactive user with 403', async () => {
            const userId = '507f1f77bcf86cd799439011';
            jwt.verify.mockReturnValue({ id: userId, tokenVersion: 1 });
            req.headers.authorization = 'Bearer good.token';

            const mockUser = { _id: userId, role: 'TEACHER', isActive: false, tokenVersion: 1, school: 'sch1' };
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(403);
            expect(err.message).toBe('Forbidden, account deactivated. Contact support.');
        });

        it('rejects with 401 when user not found', async () => {
            const userId = '507f1f77bcf86cd799439099';
            jwt.verify.mockReturnValue({ id: userId, tokenVersion: 1 });
            req.headers.authorization = 'Bearer good.token';

            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

            await protect(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, user not found.');
        });
    });

    describe('authorizeRoles', () => {
        it('rejects when req.user is missing', () => {
            const mw = authorizeRoles(['TEACHER']);
            mw(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Authentication required. Please log in.');
        });

        it('rejects forbidden role with 403 and required roles in message', () => {
            const mw = authorizeRoles(['TEACHER']);
            req.user = { role: 'STUDENT' };
            mw(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(403);
            expect(err.message).toContain('Forbidden: Access denied. Required role(s):');
            expect(err.message).toContain('TEACHER');
        });

        it('allows when role is permitted', () => {
            const mw = authorizeRoles(['TEACHER', 'PRINCIPAL']);
            req.user = { role: 'TEACHER' };
            mw(req, res, next);
            expect(next).toHaveBeenCalled();
            // Ensure it was a pass-through (no error object)
            const firstArg = next.mock.calls[0][0];
            expect(firstArg).toBeUndefined();
        });
    });

    describe('protectMfa', () => {
        it('returns 401 when MFA token missing', async () => {
            await protectMfa(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, no MFA token provided.');
        });

        it('rejects when token type is invalid (mfa flag missing/false)', async () => {
            req.headers.authorization = 'Bearer mfa.token';
            jwt.verify.mockReturnValue({ id: 'u1' });
            await protectMfa(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, invalid token type.');
        });

        it('attaches minimal user and passes when mfa=true', async () => {
            req.headers.authorization = 'Bearer mfa.ok';
            jwt.verify.mockReturnValue({ id: 'u1', mfa: true });
            await protectMfa(req, res, next);
            expect(req.user).toEqual({ id: 'u1' });
            expect(next).toHaveBeenCalled();
            expect(next.mock.calls[0][0]).toBeUndefined();
        });

        it('handles jwt verify errors as expired/failed', async () => {
            req.headers.authorization = 'Bearer mfa.bad';
            jwt.verify.mockImplementation(() => { throw new Error('bad'); });
            await protectMfa(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Not authorized, MFA token failed or expired.');
        });
    });

    describe('authorizeGlobalAdmin', () => {
        let originalEnv;
        beforeEach(() => { originalEnv = process.env.ZINNOL_CEO_EMAIL; });
        afterEach(() => { process.env.ZINNOL_CEO_EMAIL = originalEnv; });

        it('rejects with 500 when ZINNOL_CEO_EMAIL is not set', async () => {
            process.env.ZINNOL_CEO_EMAIL = '';
            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            req.user = { role: roles.GLOBAL_SUPER_ADMIN, email: 'ceo@zinnol.com' };
            await authorizeGlobalAdmin(req, res, next);
            expect(spy).toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(500);
            expect(err.message).toBe('Server configuration error, access denied.');
            spy.mockRestore();
        });

        it('rejects with 403 when role or email does not match', async () => {
            process.env.ZINNOL_CEO_EMAIL = 'ceo@zinnol.com';
            req.user = { role: 'TEACHER', email: 'ceo@zinnol.com' };
            await authorizeGlobalAdmin(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const err = next.mock.calls[0][0];
            expect(err.statusCode).toBe(403);
            expect(err.message).toBe('Forbidden: Only Global Super Admin (CEO) allowed.');
        });

        it('allows Global Super Admin with matching email', async () => {
            process.env.ZINNOL_CEO_EMAIL = 'ceo@zinnol.com';
            req.user = { role: roles.GLOBAL_SUPER_ADMIN, email: 'ceo@zinnol.com' };
            await authorizeGlobalAdmin(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(next.mock.calls[0][0]).toBeUndefined();
        });
    });
});
