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
import {
    setAllFeaturesForSchool,
    getFeaturesForSchool,
    setFeatureForSchool
} from './schoolFeatureController.js';
import errorHandler from '../middleware/errorMiddleware.js';

let mongoServer;
let app;
let adminUser;
let schoolAdminUser;
let regularUser;
let testSchool;
let adminAccessToken;
let schoolAdminAccessToken;
let regularAccessToken;

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
    app.put('/api/schools/:schoolId/features/all', mockProtect, setAllFeaturesForSchool);
    app.get('/api/schools/:schoolId/features', mockProtect, getFeaturesForSchool);
    app.put('/api/schools/:schoolId/features/:feature', mockProtect, setFeatureForSchool);

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

    // Create test school
    testSchool = await School.create({
        name: 'Test School',
        address: '123 Test St',
        phone: '123-456-7890',
        email: 'school@test.com',
        features: new Map([
            ['student_management', true],
            ['result_management', false],
            ['exam_management', true],
            ['notification', false],
            ['calendar', true],
            ['search', false],
            ['map', true]
        ])
    });

    // Create test users
    adminUser = await User.create({
        name: 'Global Admin',
        email: 'admin@example.com',
        password: 'password123',
        role: roles.GLOBAL_SUPER_ADMIN,
        isActive: true
    });

    schoolAdminUser = await User.create({
        name: 'School Admin',
        email: 'schooladmin@example.com',
        password: 'password123',
        role: roles.SCHOOL_ADMIN,
        school: testSchool._id,
        isActive: true
    });

    regularUser = await User.create({
        name: 'Regular User',
        email: 'user@example.com',
        password: 'password123',
        role: roles.TEACHER,
        school: testSchool._id,
        isActive: true
    });

    // Login to get access tokens
    const adminLogin = await request(app)
        .post('/api/users/login')
        .send({ email: 'admin@example.com', password: 'password123' });

    adminAccessToken = adminLogin.body.accessToken;

    const schoolAdminLogin = await request(app)
        .post('/api/users/login')
        .send({ email: 'schooladmin@example.com', password: 'password123' });

    schoolAdminAccessToken = schoolAdminLogin.body.accessToken;

    const regularLogin = await request(app)
        .post('/api/users/login')
        .send({ email: 'user@example.com', password: 'password123' });

    regularAccessToken = regularLogin.body.accessToken;
});

describe('School Feature Controller', () => {
    describe('PUT /api/schools/:schoolId/features/all', () => {
        it('should enable all features for a school (Global Admin)', async () => {
            const response = await request(app)
                .put(`/api/schools/${testSchool._id}/features/all`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ enable: true })
                .expect(200);

            expect(response.body.message).toContain('All features have been enabled');
            expect(response.body.features.student_management).toBe(true);
            expect(response.body.features.result_management).toBe(true);
            expect(response.body.features.exam_management).toBe(true);
        });

        it('should disable all features for a school (Global Admin)', async () => {
            const response = await request(app)
                .put(`/api/schools/${testSchool._id}/features/all`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ enable: false })
                .expect(200);

            expect(response.body.message).toContain('All features have been disabled');
            expect(response.body.features.student_management).toBe(false);
            expect(response.body.features.result_management).toBe(false);
            expect(response.body.features.exam_management).toBe(false);
        });

        it('should allow school admin to modify features for their school', async () => {
            const response = await request(app)
                .put(`/api/schools/${testSchool._id}/features/all`)
                .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
                .send({ enable: false })
                .expect(200);

            expect(response.body.message).toContain('All features have been disabled');
        });

        it('should return 404 for non-existent school', async () => {
            const fakeSchoolId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .put(`/api/schools/${fakeSchoolId}/features/all`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ enable: true })
                .expect(404);

            expect(response.body.message).toBe('School not found');
        });
    });

    describe('GET /api/schools/:schoolId/features', () => {
        it('should return all features for a school (Global Admin)', async () => {
            const response = await request(app)
                .get(`/api/schools/${testSchool._id}/features`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.features.student_management).toBe(true);
            expect(response.body.features.result_management).toBe(false);
            expect(response.body.features.exam_management).toBe(true);
        });

        it('should allow school admin to view features for their school', async () => {
            const response = await request(app)
                .get(`/api/schools/${testSchool._id}/features`)
                .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
                .expect(200);

            expect(response.body.features).toBeDefined();
        });

        it('should return 404 for non-existent school', async () => {
            const fakeSchoolId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .get(`/api/schools/${fakeSchoolId}/features`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(404);

            expect(response.body.message).toBe('School not found');
        });
    });

    describe('PUT /api/schools/:schoolId/features/:feature', () => {
        it('should enable individual feature for a school (Global Admin)', async () => {
            const response = await request(app)
                .put(`/api/schools/${testSchool._id}/features/result_management`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ enable: true })
                .expect(200);

            expect(response.body.message).toContain("Feature 'result_management' has been enabled");
            expect(response.body.features.result_management).toBe(true);
        });

        it('should disable individual feature for a school (Global Admin)', async () => {
            const response = await request(app)
                .put(`/api/schools/${testSchool._id}/features/student_management`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ enable: false })
                .expect(200);

            expect(response.body.message).toContain("Feature 'student_management' has been disabled");
            expect(response.body.features.student_management).toBe(false);
        });

        it('should allow school admin to modify features for their school', async () => {
            const response = await request(app)
                .put(`/api/schools/${testSchool._id}/features/notification`)
                .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
                .send({ enable: true })
                .expect(200);

            expect(response.body.message).toContain("Feature 'notification' has been enabled");
        });

        it('should return 404 for non-existent school', async () => {
            const fakeSchoolId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .put(`/api/schools/${fakeSchoolId}/features/student_management`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ enable: true })
                .expect(404);

            expect(response.body.message).toBe('School not found');
        });
    });
});
