// Additional strict tests for googleDriveController endpoints
import { vi } from 'vitest';
vi.mock('../../../services/googleDriveService.js', () => ({
    __esModule: true,
    default: {
        generateAuthUrl: vi.fn(() => 'https://auth'),
        handleAuthCallback: vi.fn(async () => ({ tokens: true })),
        uploadTermData: vi.fn(async () => ({ uploaded: true })),
        createSchoolFolderStructure: vi.fn(async () => ({ results: 'r1', students: 's1', term: 't1' })),
        listFiles: vi.fn(async () => ([{ id: 'f1', name: 'file.txt' }])),
        isAuthenticated: true,
        rootFolderId: 'root123',
        drive: {},
        isTokenValid: vi.fn(() => true)
    }
}));

// Mock mongoose to avoid ObjectId constructor issues in aggregation
vi.mock('mongoose', () => ({
    __esModule: true,
    default: { Types: { ObjectId: (v) => v } },
    Types: { ObjectId: (v) => v }
}));

import { backupSchoolData, getAvailableSchools, handleAuthCallback } from '../../../controllers/googleDriveController.js';
import googleDriveService from '../../../services/googleDriveService.js';
import asyncHandler from '../../../middleware/asyncHandler.js';
import { roles } from '../../../config/roles.js';

// Dynamically mocked models
vi.mock('../../../models/School.js', () => ({
    __esModule: true,
    default: {
        findById: vi.fn(),
        find: vi.fn()
    }
}));
vi.mock('../../../models/Student.js', () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        countDocuments: vi.fn()
    }
}));
vi.mock('../../../models/Result.js', () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        countDocuments: vi.fn(),
        aggregate: vi.fn()
    }
}));

import School from '../../../models/School.js';
import Student from '../../../models/Student.js';
import Result from '../../../models/Result.js';

const mkRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() });

const serviceMock = googleDriveService;

// Helpers
const flush = () => new Promise(r => process.nextTick(r));

describe('googleDriveController extra endpoints (unit)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('backupSchoolData', () => {
        const makeFindByIdResult = (doc) => {
            return {
                select: () => ({ lean: () => doc }),
                lean: () => doc,
                then: (resolve) => Promise.resolve(doc).then(resolve),
                catch: () => { },
            };
        };

        test('success backup by main super admin', async () => {
            const schoolId = 'sch1';
            const user = { _id: 'u1', role: roles.SUPER_ADMIN }; // must also be mainSuperAdmin in school
            School.findById.mockReturnValue(makeFindByIdResult({ _id: schoolId, name: 'Test High', mainSuperAdmins: ['u1'] }));
            Student.find.mockReturnValue({ select: () => ({ lean: () => [{ _id: 'stu1', firstName: 'A' }] }) });
            Student.countDocuments.mockResolvedValue(1);
            // Controller calls: Result.find(...).populate(...).populate(...).populate(...).lean()
            const resultChain = {
                populate: function () { return this; },
                lean: () => []
            };
            Result.find.mockReturnValue(resultChain);
            Result.countDocuments.mockResolvedValue(0);
            Result.aggregate.mockResolvedValue([{ averageScore: 0, totalExams: 0, passCount: 0 }]);

            const req = { body: { schoolId }, user };
            const res = mkRes();
            const next = vi.fn();
            await asyncHandler(backupSchoolData)(req, res, next); await flush();
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            const body = res.json.mock.calls[0][0];
            expect(body.success).toBe(true);
            expect(body.message).toMatch(/backed up/i);
            expect(body.data.backup.school.name).toBe('Test High');
            expect(serviceMock.uploadTermData).toHaveBeenCalled();
        });

        test('school not found', async () => {
            School.findById.mockReturnValue(makeFindByIdResult(null));
            const req = { body: { schoolId: 'missing' }, user: { _id: 'u1', role: roles.SUPER_ADMIN } };
            const res = mkRes();
            const next = vi.fn();
            await asyncHandler(backupSchoolData)(req, res, next); await flush();
            expect(res.status).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
            const err = next.mock.calls[0][0];
            expect(err.message).toMatch(/School not found/);
        });

        test('forbidden when not main super admin or school admin', async () => {
            School.findById.mockReturnValue(makeFindByIdResult({ _id: 'sch1', name: 'T', mainSuperAdmins: ['other'] }));
            const req = { body: { schoolId: 'sch1' }, user: { _id: 'u1', role: roles.SUPER_ADMIN } };
            const res = mkRes();
            const next = vi.fn();
            await asyncHandler(backupSchoolData)(req, res, next); await flush();
            const err = next.mock.calls[0][0];
            expect(err.message).toMatch(/permission/);
            expect(err.statusCode || err.status).toBe(403);
        });
    });

    describe('getAvailableSchools', () => {
        test('super admin sees only their main schools', async () => {
            School.find.mockReturnValue({ select: () => ({ sort: () => ({ lean: () => [{ _id: 'sch1', name: 'A' }] }) }) });
            const req = { user: { _id: 'u1', role: roles.SUPER_ADMIN } };
            const res = mkRes();
            await asyncHandler(getAvailableSchools)(req, res, vi.fn()); await flush();
            const body = res.json.mock.calls[0][0];
            expect(body.data).toEqual([{ _id: 'sch1', name: 'A' }]);
            expect(body.message).toMatch(/Available schools/);
        });

        test('school admin sees only their school', async () => {
            School.findById.mockReturnValue({ select: () => ({ lean: () => ({ _id: 'sch2', name: 'B' }) }) });
            const req = { user: { _id: 'sa', role: roles.SCHOOL_ADMIN, school: 'sch2' } };
            const res = mkRes();
            await asyncHandler(getAvailableSchools)(req, res, vi.fn()); await flush();
            const body = res.json.mock.calls[0][0];
            expect(body.data).toEqual([{ _id: 'sch2', name: 'B' }]);
        });

        test('unauthorized role gets empty array', async () => {
            const req = { user: { _id: 'x', role: roles.TEACHER } };
            const res = mkRes();
            await asyncHandler(getAvailableSchools)(req, res, vi.fn()); await flush();
            const body = res.json.mock.calls[0][0];
            expect(body.data).toEqual([]);
        });
    });

    describe('handleAuthCallback', () => {
        test('error query returns 400 style ok with message', async () => {
            const req = { query: { error: 'access_denied' } };
            const res = mkRes();
            await asyncHandler(handleAuthCallback)(req, res, vi.fn()); await flush();
            const body = res.json.mock.calls[0][0];
            expect(body.message).toMatch(/access_denied/);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('missing code returns 400', async () => {
            const req = { query: {} };
            const res = mkRes();
            await asyncHandler(handleAuthCallback)(req, res, vi.fn()); await flush();
            const body = res.json.mock.calls[0][0];
            expect(res.status).toHaveBeenCalledWith(400);
            expect(body.message).toMatch(/Authorization code is required/);
        });

        test('success redirects', async () => {
            const req = { query: { code: 'abc' } };
            const res = mkRes();
            await asyncHandler(handleAuthCallback)(req, res, vi.fn()); await flush();
            expect(res.redirect).toHaveBeenCalled();
            const url = res.redirect.mock.calls[0][0];
            expect(url).toMatch(/success=true/);
        });
    });
});
