// Mock service BEFORE importing controller so controller uses the mock
import { vi } from 'vitest';
vi.mock('../../../services/googleDriveService.js', () => ({
    __esModule: true,
    default: {
        generateAuthUrl: vi.fn(() => 'https://auth'),
        handleAuthCallback: vi.fn(),
        uploadTermData: vi.fn(async () => ({ uploaded: true })),
        createSchoolFolderStructure: vi.fn(async () => ({ results: 'r1', students: 's1', term: 't1' })),
        listFiles: vi.fn(async () => ([{ id: 'f1', name: 'file.txt' }])),
        isAuthenticated: true,
        rootFolderId: 'root123',
        drive: {},
        isTokenValid: vi.fn(() => true)
    }
}));

import { getAuthUrl, disconnectDrive, uploadTermData, createSchoolStructure, listFiles, getDriveStatus } from '../../../controllers/googleDriveController.js';
import googleDriveService from '../../../services/googleDriveService.js';
import asyncHandler from '../../../middleware/asyncHandler.js';
import { roles } from '../../../config/roles.js';

// Retrieve mocked instance
const serviceMock = googleDriveService;

const mkRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() });

const superAdminUser = { _id: 'u1', role: roles.GLOBAL_SUPER_ADMIN };

describe('googleDriveController (unit)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    test('getAuthUrl success (super admin)', async () => {
        const req = { user: superAdminUser };
        const res = mkRes();
        const next = vi.fn();
        await asyncHandler(getAuthUrl)(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.data.authUrl).toBe('https://auth');
    });

    test('getAuthUrl forbidden for teacher', async () => {
        const req = { user: { role: roles.TEACHER } };
        const res = mkRes();
        const next = vi.fn();
        await asyncHandler(getAuthUrl)(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.message).toMatch(/Only Super Admin/);
        expect(err.statusCode || err.status).toBe(403);
    });

    test('disconnectDrive resets state', async () => {
        const req = { user: superAdminUser };
        const res = mkRes();
        await asyncHandler(disconnectDrive)(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].message).toMatch(/disconnected/i);
    });

    test('uploadTermData validates fields', async () => {
        const req = { body: { schoolName: 'Test', academicYear: '2024/2025', term: '1', data: {} } };
        const res = mkRes();
        await asyncHandler(uploadTermData)(req, res, vi.fn());
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.data.uploaded).toBe(true);
    });

    test('createSchoolStructure created 201', async () => {
        const req = { body: { schoolName: 'Test', academicYear: '2024/2025', term: '1' } };
        const res = mkRes();
        await asyncHandler(createSchoolStructure)(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(201);
        const body = res.json.mock.calls[0][0];
        expect(body.data.results).toBe('r1');
    });

    test('listFiles success', async () => {
        serviceMock.createSchoolFolderStructure.mockResolvedValueOnce({ results: 'resultsFolder' });
        serviceMock.listFiles.mockResolvedValueOnce([{ id: 'f1', name: 'file.txt' }]);
        const req = { params: { schoolName: 'S', academicYear: 'AY', term: '1', folderType: 'results' } };
        const res = mkRes();
        const next = vi.fn();
        await listFiles(req, res, next);
        // Flush microtasks since listFiles is an asyncHandler-wrapped sync return (does not return a promise)
        await new Promise(resolve => process.nextTick(resolve));
        if (next.mock.calls.length) {
            const err = next.mock.calls[0][0];
            throw new Error('listFiles error: ' + err.message);
        }
        // Assert service interactions
        expect(serviceMock.createSchoolFolderStructure).toHaveBeenCalledWith('S', 'AY', '1');
        expect(serviceMock.listFiles).toHaveBeenCalledWith('resultsFolder');
        // Strict response envelope assertions
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledTimes(1);
        const body = res.json.mock.calls[0][0];
        expect(body).toMatchObject({ success: true, message: 'Files retrieved successfully' });
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toEqual([{ id: 'f1', name: 'file.txt' }]);
        // Ensure no unexpected top-level fields besides (success,message,data,meta)
        const allowedKeys = ['success', 'message', 'data', 'meta'];
        Object.keys(body).forEach(k => expect(allowedKeys).toContain(k));
    });

    test('getDriveStatus returns status object', async () => {
        serviceMock.isAuthenticated = true;
        serviceMock.rootFolderId = 'root123';
        const req = {};
        const res = mkRes();
        await asyncHandler(getDriveStatus)(req, res, vi.fn());
        const body = res.json.mock.calls[0][0];
        expect(body.data.isAuthenticated).toBe(true);
        expect(body.data.rootFolderId).toBe('root123');
    });
});
