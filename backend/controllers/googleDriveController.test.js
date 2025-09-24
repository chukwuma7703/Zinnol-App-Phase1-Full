import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/userModel.js';
import School from '../models/School.js';
import { roles } from '../config/roles.js';
import errorHandler from '../middleware/errorMiddleware.js';

// ESM-compatible mocking: mock the service module before importing the controller
await jest.unstable_mockModule('../services/googleDriveService.js', () => {
    console.log('Mocking googleDriveService');
    return {
        default: {
            generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth/authorize?client_id=test'),
            handleAuthCallback: jest.fn().mockResolvedValue({ success: true, tokens: { access_token: 'test_token' } }),
            uploadTermData: jest.fn().mockResolvedValue({ uploads: [], term: '1', academicYear: '2024/2025' }),
            createSchoolFolderStructure: jest.fn().mockResolvedValue({
                school: 'schoolFolder', year: 'yearFolder', term: 'termFolder', results: 'resultsFolder', students: 'studentsFolder', reports: 'reportsFolder', backups: 'backupsFolder'
            }),
            listFiles: jest.fn().mockResolvedValue([
                { id: 'file1', name: 'test1.pdf', mimeType: 'application/pdf' },
                { id: 'file2', name: 'test2.pdf', mimeType: 'application/pdf' }
            ]),
            isAuthenticated: false,
            rootFolderId: null,
            isTokenValid: jest.fn().mockReturnValue(false),
            generateAuthUrlCalled: false,
            drive: {},
            disconnect: jest.fn(),
        }
    }
});

const { default: googleDriveService } = await import('../services/googleDriveService.js');
const {
    getAuthUrl,
    handleAuthCallback,
    disconnectDrive,
    uploadTermData,
    createSchoolStructure,
    listFiles,
    getDriveStatus,
    backupSchoolData,
    getAvailableSchools
} = await import('./googleDriveController.js');


let mongoServer;
let app;
let adminUser;
let regularUser;
let adminAccessToken;
let regularAccessToken;
let testSchool;

beforeAll(async () => {
    // Set up test environment variables
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.NODE_ENV = 'test';

    // Disconnect if already connected to avoid multiple connection errors
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Set up Express app for testing
    app = express();
    app.use(cookieParser());
    app.use(express.json());

    // Mock auth middleware for protected routes
    const mockAuth = async (req, res, next) => {
        // For testing, we'll decode the JWT to get the user
        const authHeader = req.headers.authorization || req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7).trim();
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                req.user = user;
            } catch (error) {
                req.user = adminUser; // Default to adminUser on error
            }
        } else {
            req.user = adminUser; // Default to adminUser if no auth header
        }
        next();
    };

    // Mock protect middleware
    const mockProtect = (req, res, next) => {
        mockAuth(req, res, next);
    };

    // Routes
    app.get('/api/drive/auth/url', mockProtect, getAuthUrl);
    app.get('/api/drive/auth/callback', handleAuthCallback);
    app.delete('/api/drive/disconnect', mockProtect, disconnectDrive);
    app.post('/api/drive/upload-term-data', mockProtect, uploadTermData);
    app.post('/api/drive/create-school-structure', mockProtect, createSchoolStructure);
    app.get('/api/drive/list-files/:schoolName/:academicYear/:term/:folderType', mockProtect, listFiles);
    app.get('/api/drive/status', mockProtect, getDriveStatus);
    app.post('/api/drive/backup-school-data', mockProtect, backupSchoolData);
    app.get('/api/drive/available-schools', mockProtect, getAvailableSchools);

    // Error handling
    app.use(errorHandler);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    // Clear database before each test
    await User.deleteMany({});
    await School.deleteMany({});

    // Create test users
    adminUser = await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        role: roles.GLOBAL_SUPER_ADMIN,
        isActive: true
    });

    regularUser = await User.create({
        name: 'Regular User',
        email: 'user@example.com',
        password: 'password123',
        role: roles.TEACHER,
        school: new mongoose.Types.ObjectId(),
        isActive: true
    });

    // Generate tokens locally for tests
    adminAccessToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET);
    regularAccessToken = jwt.sign({ id: regularUser._id }, process.env.JWT_SECRET);

    // Seed a school for backup tests
    testSchool = await School.create({
        name: 'Test School',
        address: '123 Test St',
        phone: '000',
        mainSuperAdmins: [adminUser._id],
    });

    // Re-apply mocked implementations (jest.resetMocks is enabled)
    if (googleDriveService) {
        if (typeof googleDriveService.generateAuthUrl === 'function') {
            googleDriveService.generateAuthUrl.mockReturnValue('https://accounts.google.com/oauth/authorize?client_id=test');
        }
        if (typeof googleDriveService.handleAuthCallback === 'function') {
            googleDriveService.handleAuthCallback.mockResolvedValue({ success: true, tokens: { access_token: 'test_token' } });
        }
        if (typeof googleDriveService.uploadTermData === 'function') {
            googleDriveService.uploadTermData.mockResolvedValue({ uploads: [], term: '1', academicYear: '2024/2025' });
        }
        if (typeof googleDriveService.createSchoolFolderStructure === 'function') {
            googleDriveService.createSchoolFolderStructure.mockResolvedValue({
                school: 'schoolFolder', year: 'yearFolder', term: 'termFolder', results: 'resultsFolder', students: 'studentsFolder', reports: 'reportsFolder', backups: 'backupsFolder'
            });
        }
        if (typeof googleDriveService.listFiles === 'function') {
            googleDriveService.listFiles.mockResolvedValue([
                { id: 'file1', name: 'test1.pdf', mimeType: 'application/pdf' },
                { id: 'file2', name: 'test2.pdf', mimeType: 'application/pdf' }
            ]);
        }
        if (typeof googleDriveService.isTokenValid === 'function') {
            googleDriveService.isTokenValid.mockReturnValue(false);
        }
        googleDriveService.isAuthenticated = false;
        googleDriveService.rootFolderId = null;
        googleDriveService.drive = {};
    }
});

describe('Google Drive Controller', () => {
    describe('GET /api/drive/auth/url', () => {
        it('should return auth URL for super admin', async () => {
            const response = await request(app)
                .get('/api/drive/auth/url')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(typeof response.body.data.authUrl).toBe('string');
        });

        it('should deny access to non-super admin', async () => {
            const response = await request(app)
                .get('/api/drive/auth/url')
                .set('Authorization', `Bearer ${regularAccessToken}`)
                .expect(403);

            expect(response.body.message).toContain('Only Super Admin can configure Google Drive');
        });
    });

    describe('GET /api/drive/auth/callback', () => {
        it('should handle successful auth callback', async () => {
            const response = await request(app)
                .get('/api/drive/auth/callback?code=test_code')
                .expect(302); // Redirect

            expect(googleDriveService.handleAuthCallback).toHaveBeenCalledWith('test_code');
            // Should redirect to frontend with success
        });

        it('should handle auth error', async () => {
            const response = await request(app)
                .get('/api/drive/auth/callback?error=access_denied')
                .expect(400);

            expect(response.body.message).toContain('Authentication failed');
        });

        it('should require authorization code', async () => {
            const response = await request(app)
                .get('/api/drive/auth/callback')
                .expect(400);

            expect(response.body.message).toBe('Authorization code is required');
        });
    });

    describe('DELETE /api/drive/disconnect', () => {
        it('should disconnect Google Drive for admin', async () => {
            googleDriveService.isAuthenticated = true;
            const response = await request(app)
                .delete('/api/drive/disconnect')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(googleDriveService.isAuthenticated).toBe(false);
        });
    });

    describe('POST /api/drive/upload', () => {
        it('should upload term data successfully', async () => {
            const response = await request(app)
                .post('/api/drive/upload-term-data')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({
                    schoolName: 'Test School',
                    academicYear: '2024/2025',
                    term: '1',
                    data: { results: [{ studentName: 'A', subject: 'Math', score: 90, maxScore: 100, grade: 'A' }] }
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(googleDriveService.uploadTermData).toHaveBeenCalled();
        });
    });

    describe('POST /api/drive/structure', () => {
        it('should create school structure in Drive', async () => {
            const response = await request(app)
                .post('/api/drive/create-school-structure')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({
                    schoolName: 'Test School',
                    academicYear: '2024/2025',
                    term: '1'
                })
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(googleDriveService.createSchoolFolderStructure).toHaveBeenCalled();
        });
    });

    describe('GET /api/drive/files', () => {
        it('should list files from Google Drive', async () => {
            const academicYear = encodeURIComponent('2024/2025');
            const response = await request(app)
                .get(`/api/drive/list-files/Test%20School/${academicYear}/1/results`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data).toHaveLength(2);
            expect(googleDriveService.listFiles).toHaveBeenCalled();
        });
    });

    describe('GET /api/drive/status', () => {
        it('should return Google Drive connection status', async () => {
            const response = await request(app)
                .get('/api/drive/status')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('isAuthenticated');
        });
    });

    describe('POST /api/drive/backup', () => {
        it('should backup school data to Google Drive', async () => {
            const response = await request(app)
                .post('/api/drive/backup-school-data')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({
                    schoolId: testSchool._id.toString(),
                    includeStudents: false,
                    includeResults: false,
                    includeReports: false
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(googleDriveService.uploadTermData).toHaveBeenCalled();
        });
    });

    describe('GET /api/drive/schools', () => {
        it('should return available schools for backup', async () => {
            const response = await request(app)
                .get('/api/drive/available-schools')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            // This endpoint likely returns schools from database
        });
    });
});
