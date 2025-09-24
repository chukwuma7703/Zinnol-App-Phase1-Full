import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/userModel.js';
import Classroom from '../models/Classroom.js';
import TeachingAssignment from '../models/TeachingAssignment.js';
import { roles } from '../config/roles.js';
import errorHandler from '../middleware/errorMiddleware.js';

// ESM-compatible mocking for predictive analytics service
await jest.unstable_mockModule('../services/predictiveAnalytics.js', () => ({
    __esModule: true,
    default: {
        predictDeclineRisk: jest.fn(),
    },
    predictClassDeclineRisks: jest.fn(),
    monitorStudentRisk: jest.fn(),
}));

const { default: predictiveModel, predictClassDeclineRisks, monitorStudentRisk } = await import('../services/predictiveAnalytics.js');
const {
    predictStudentDecline,
    predictClassroomDeclines,
    getSchoolRiskDashboard,
    monitorStudent,
    getPredictionAccuracy,
    getInterventionPlan,
} = await import('./predictiveAnalyticsController.js');

let mongoServer;
let app;
let testUser;
let teacherUser;
let adminUser;
let studentUser;
let classroom;
let accessToken;
let teacherAccessToken;
let adminAccessToken;
let studentAccessToken;

beforeAll(async () => {
    // Set up test environment variables
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-testing-purposes-only';
    process.env.JWT_EXPIRE = '1h';
    process.env.JWT_REFRESH_EXPIRE = '7d';
    process.env.NODE_ENV = 'test';

    // Initial mock shape; implementations will be re-applied in beforeEach due to resetMocks
    predictiveModel.predictDeclineRisk.mockResolvedValue({});
    predictClassDeclineRisks.mockResolvedValue([]);
    monitorStudentRisk.mockResolvedValue({});

    // Disconnect if already connected to avoid multiple connection errors
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);    // Set up Express app for testing
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
                req.user = testUser; // Default to testUser on error
            }
        } else {
            req.user = testUser; // Default to testUser if no auth header
        }
        next();
    };

    // Mock protect middleware
    const mockProtect = (req, res, next) => {
        mockAuth(req, res, next);
    };

    // Mock authorizeRoles middleware
    const mockAuthorizeRoles = (allowedRoles) => {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized' });
            }
            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ message: 'Not authorized for this action' });
            }
            next();
        };
    };

    // Routes
    app.get('/api/analytics/predict/student/:studentId', mockProtect, predictStudentDecline);
    app.get('/api/analytics/predict/classroom/:classroomId', mockProtect, predictClassroomDeclines);
    app.get('/api/analytics/predict/school-dashboard', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]), getSchoolRiskDashboard);
    app.post('/api/analytics/monitor/:studentId', mockProtect, monitorStudent);
    app.get('/api/analytics/accuracy', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), getPredictionAccuracy);
    app.get('/api/analytics/intervention/:studentId', mockProtect, getInterventionPlan);

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
    await Classroom.deleteMany({});
    await TeachingAssignment.deleteMany({});

    // Create test school
    const testSchool = new mongoose.Types.ObjectId();

    // Create test users (create teacher first for classroom teacher requirement)
    teacherUser = await User.create({
        name: 'Teacher User',
        email: 'teacher@example.com',
        password: 'password123',
        role: roles.TEACHER,
        school: testSchool,
        isActive: true
    });

    adminUser = await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        role: roles.GLOBAL_SUPER_ADMIN,
        isActive: true
    });

    testUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: roles.STUDENT,
        school: testSchool,
        isActive: true
    });

    // Create test classroom (requires teacher, stage, level)
    classroom = await Classroom.create({
        school: testSchool,
        stage: 'jss',
        level: 1,
        section: 'A',
        teacher: teacherUser._id,
    });

    studentUser = await User.create({
        name: 'Student User',
        email: 'student@example.com',
        password: 'password123',
        role: roles.STUDENT,
        school: testSchool,
        classroom: classroom._id,
        isActive: true
    });

    // Ensure student can access own resources (studentProfile equals their user id in this test context)
    await User.findByIdAndUpdate(studentUser._id, { studentProfile: studentUser._id });

    // Create teaching assignment
    await TeachingAssignment.create({
        school: testSchool,
        teacher: teacherUser._id,
        classroom: classroom._id,
        subject: new mongoose.Types.ObjectId(),
        academicYear: '2024-2025'
    });

    // Re-apply predictive analytics service mocks (reset by Jest between tests)
    predictiveModel.predictDeclineRisk.mockResolvedValue({
        riskScore: 65,
        riskLevel: 'MEDIUM',
        factors: {
            gradeTrend: 60,
            attendanceRate: 40,
            subjectStruggle: 55,
            examPerformance: 70,
            volatility: 20
        },
        confidence: 0.85,
        predictionDate: new Date(),
        recommendation: [
            {
                priority: 'HIGH',
                action: 'Schedule parent-teacher meeting',
                description: 'Discuss student performance concerns'
            },
            {
                priority: 'MEDIUM',
                action: 'Provide additional tutoring',
                description: 'Extra help in struggling subjects'
            }
        ]
    });

    predictClassDeclineRisks.mockResolvedValue([
        {
            studentId: 'student1',
            studentName: 'Student One',
            riskScore: 80,
            riskLevel: 'HIGH',
            factors: { gradeTrend: 80, volatility: 70 },
            recommendation: [{ priority: 'HIGH', action: 'Immediate counseling' }]
        },
        {
            studentId: 'student2',
            studentName: 'Student Two',
            riskScore: 30,
            riskLevel: 'LOW',
            factors: { attendanceRate: 20 },
            recommendation: [{ priority: 'LOW', action: 'Encourage participation' }]
        }
    ]);

    monitorStudentRisk.mockResolvedValue({
        studentId: 'student1',
        monitoringLevel: 'HIGH',
        lastUpdated: new Date()
    });

    // Generate JWTs directly for tests
    accessToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET);
    teacherAccessToken = jwt.sign({ id: teacherUser._id }, process.env.JWT_SECRET);
    adminAccessToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET);
    studentAccessToken = jwt.sign({ id: studentUser._id }, process.env.JWT_SECRET);
});

describe('Predictive Analytics Controller', () => {
    describe('GET /api/analytics/predict/student/:studentId', () => {
        it('should predict student decline risk for admin', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/student/${studentUser._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Student decline risk prediction generated');
            expect(response.body.data).toHaveProperty('riskScore');
            expect(response.body.data).toHaveProperty('riskLevel');
        });

        it('should predict student decline risk for teacher of the class', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/student/${studentUser._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${teacherAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('riskScore');
        });

        it('should allow student to view their own prediction', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/student/${studentUser._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${studentAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should return 400 if session is missing', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/student/${studentUser._id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(400);

            expect(response.body.message).toBe('Academic session is required');
        });

        it('should return 404 if student not found', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/analytics/predict/student/${fakeId}?session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(404);

            expect(response.body.message).toBe('Student not found');
        });

        it('should return 403 if teacher does not teach the student', async () => {
            // Create another classroom and student
            const otherClassroom = await Classroom.create({
                school: new mongoose.Types.ObjectId(),
                stage: 'jss',
                level: 1,
                section: 'A',
                teacher: adminUser._id,
            });

            const otherStudent = await User.create({
                name: 'Other Student',
                email: 'other@example.com',
                password: 'password123',
                role: roles.STUDENT,
                school: otherClassroom.school,
                classroom: otherClassroom._id,
                isActive: true
            });

            const response = await request(app)
                .get(`/api/analytics/predict/student/${otherStudent._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${teacherAccessToken}`)
                .expect(403);

            expect(response.body.message).toBe('Not authorized to view this prediction');
        });
    });

    describe('GET /api/analytics/predict/classroom/:classroomId', () => {
        it('should predict classroom declines for teacher of the class', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/classroom/${classroom._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${teacherAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Classroom decline predictions generated');
            expect(response.body.data).toHaveProperty('classroom');
            expect(response.body.data).toHaveProperty('stats');
            expect(response.body.data).toHaveProperty('predictions');
            expect(Array.isArray(response.body.data.predictions)).toBe(true);
        });

        it('should predict classroom declines for admin', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/classroom/${classroom._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.stats).toHaveProperty('totalStudents');
            expect(response.body.data.stats).toHaveProperty('highRisk');
        });

        it('should return 400 if session is missing', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/classroom/${classroom._id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(400);

            expect(response.body.message).toBe('Academic session is required');
        });

        it('should return 404 if classroom not found', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/analytics/predict/classroom/${fakeId}?session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(404);

            expect(response.body.message).toBe('Classroom not found');
        });

        it('should return 403 if teacher does not teach the classroom', async () => {
            // Create another teacher who doesn't teach this classroom
            const otherTeacher = await User.create({
                name: 'Other Teacher',
                email: 'otherteacher@example.com',
                password: 'password123',
                role: roles.TEACHER,
                school: classroom.school,
                isActive: true
            });

            const otherTeacherToken = jwt.sign({ id: otherTeacher._id }, process.env.JWT_SECRET);

            const response = await request(app)
                .get(`/api/analytics/predict/classroom/${classroom._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${otherTeacherToken}`)
                .expect(403);

            expect(response.body.message).toBe('You do not teach this classroom');
        });
    });

    describe('GET /api/analytics/predict/school-dashboard', () => {
        it('should return school risk dashboard for admin', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/school-dashboard?schoolId=${classroom.school}&session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('schoolStats');
            expect(response.body.data.schoolStats).toHaveProperty('totalStudents');
            expect(response.body.data.schoolStats).toHaveProperty('atRiskCount');
            expect(response.body.data.schoolStats).toHaveProperty('riskDistribution');
        });

        it('should return 400 if schoolId or session missing', async () => {
            const response = await request(app)
                .get('/api/analytics/predict/school-dashboard')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(400);

            expect(response.body.message).toBe('School ID and session are required');
        });

        it('should return 403 for non-admin user', async () => {
            const response = await request(app)
                .get(`/api/analytics/predict/school-dashboard?schoolId=${classroom.school}&session=2024-2025`)
                .set('Authorization', `Bearer ${teacherAccessToken}`)
                .expect(403);

            expect(response.body.message).toBe('Not authorized for this action');
        });
    });

    describe('POST /api/analytics/monitor/:studentId', () => {
        it('should monitor student successfully', async () => {
            const response = await request(app)
                .post(`/api/analytics/monitor/${studentUser._id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ action: 'flag_for_review', notes: 'Test monitoring' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Student monitored and alerts triggered if necessary');
        });

        it('should return 200 even if student not found (system monitoring)', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .post(`/api/analytics/monitor/${fakeId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ action: 'flag_for_review' })
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('GET /api/analytics/accuracy', () => {
        it('should return prediction accuracy metrics for admin', async () => {
            const response = await request(app)
                .get('/api/analytics/accuracy')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('overallAccuracy');
            expect(response.body.data).toHaveProperty('precision');
            expect(response.body.data).toHaveProperty('recall');
        });

        it('should return 403 for non-admin user', async () => {
            const response = await request(app)
                .get('/api/analytics/accuracy')
                .set('Authorization', `Bearer ${teacherAccessToken}`)
                .expect(403);

            expect(response.body.message).toBe('Not authorized for this action');
        });
    });

    describe('GET /api/analytics/intervention/:studentId', () => {
        it('should return intervention plan for student', async () => {
            const response = await request(app)
                .get(`/api/analytics/intervention/${studentUser._id}?session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('studentId');
            expect(response.body.data).toHaveProperty('immediateActions');
            expect(response.body.data).toHaveProperty('shortTermActions');
            expect(response.body.data).toHaveProperty('longTermActions');
            expect(Array.isArray(response.body.data.immediateActions)).toBe(true);
        });

        it('should return 200 with plan even if student not found (mocked)', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/analytics/intervention/${fakeId}?session=2024-2025`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });
});
