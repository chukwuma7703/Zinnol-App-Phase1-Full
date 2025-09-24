import request from 'supertest';
import express from 'express';
import asyncHandler from 'express-async-handler';
import { vi } from 'vitest';
import { createAssignment, getAssignmentsForClass, submitAssignment, gradeSubmission } from '../../../controllers/assignmentController.js';
import AppError from '../../../utils/AppError.js';

// Mock dependencies
vi.mock('../../../models/Assignment.js', () => ({
    __esModule: true,
    default: {
        create: vi.fn(async (data) => ({ _id: 'a1', ...data })),
        find: vi.fn(() => ({ populate: () => ({ sort: () => ([]) }) })),
        findById: vi.fn(async (id) => id === 'missing' ? null : ({ _id: id, dueDate: new Date(Date.now() + 3600_000) })),
    }
}));

vi.mock('../../../models/AssignmentSubmission.js', () => ({
    __esModule: true,
    default: {
        findOne: vi.fn(async (q) => null),
        create: vi.fn(async (data) => ({ _id: 's1', ...data })),
        findByIdAndUpdate: vi.fn(async (id, update, opts) => (id === 'missing' ? null : ({ _id: id, ...update }))),
    }
}));

vi.mock('../../../models/Classroom.js', () => ({
    __esModule: true,
    default: {
        findById: vi.fn(async (id) => ({ _id: id, school: 'sch1' })),
    }
}));

vi.mock('../../../models/Subject.js', () => ({
    __esModule: true,
    default: {
        findById: vi.fn(async (id) => ({ _id: id, school: 'sch1' })),
    }
}));

// Mock ApiResponse utilities
vi.mock('../../../utils/ApiResponse.js', () => ({
    __esModule: true,
    ok: vi.fn((res, data, message) => {
        res.status(200).json({ success: true, message, data });
    }),
    created: vi.fn((res, data, message) => {
        res.status(201).json({ success: true, message, data });
    })
}));

// Minimal auth middleware stub to inject req.user
const withUser = (user) => (req, _res, next) => { req.user = user; next(); };

// Build an express app per test group
const buildApp = (routeBuilder) => {
    const app = express();
    app.use(express.json());
    routeBuilder(app);
    // central error handler replicating AppError shape
    app.use((err, _req, res, _next) => {
        const status = err.statusCode || 500;
        res.status(status).json({ success: false, message: err.message });
    });
    return app;
};

// Helper to extract success envelope assertions
const expectSuccessShape = (body, { message }) => {
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('message', message);
    expect(body).toHaveProperty('data');
};

describe('assignmentController (ApiResponse)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('createAssignment returns 201 with ApiResponse shape', async () => {
        const app = buildApp((a) => a.post('/api/assignments', withUser({ _id: 't1', school: 'sch1' }), createAssignment));
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
        const res = await request(app).post('/api/assignments').send({ classroom: 'c1', subject: 'sub1', title: 'T', description: 'D', dueDate: futureDate });
        expect(res.status).toBe(201);
        expectSuccessShape(res.body, { message: 'Assignment created successfully.' });
    });

    test('getAssignmentsForClass returns 200 with ApiResponse shape', async () => {
        const app = buildApp((a) => a.get('/api/assignments/class/:id', withUser({ _id: 't1', school: 'sch1' }), (req, res, next) => {
            req.params.classroomId = req.params.id; // align param name
            return getAssignmentsForClass(req, res, next);
        }));
        const res = await request(app).get('/api/assignments/class/c1');
        expect(res.status).toBe(200);
        expectSuccessShape(res.body, { message: 'Assignments retrieved successfully.' });
    });

    test('submitAssignment rejects non-student', async () => {
        const app = buildApp((a) => a.post('/api/assignments/:id/submit', withUser({ _id: 'u1' }), submitAssignment));
        const res = await request(app).post('/api/assignments/a1/submit').send({ textSubmission: 'Answer' });
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test('submitAssignment returns 201 for valid student', async () => {
        const app = buildApp((a) => a.post('/api/assignments/:id/submit', withUser({ _id: 'u1', studentProfile: 'stu1' }), submitAssignment));
        const res = await request(app).post('/api/assignments/a1/submit').send({ textSubmission: 'Answer' });
        expect(res.status).toBe(201);
        expectSuccessShape(res.body, { message: 'Assignment submitted successfully.' });
    });

    test('submitAssignment 404 when assignment missing', async () => {
        const app = buildApp((a) => a.post('/api/assignments/:id/submit', withUser({ _id: 'u1', studentProfile: 'stu1' }), submitAssignment));
        const res = await request(app).post('/api/assignments/missing/submit').send({ textSubmission: 'Answer' });
        expect(res.status).toBe(404);
    });

    test('gradeSubmission returns 200 with ApiResponse shape', async () => {
        const app = buildApp((a) => a.patch('/api/assignments/submissions/:id/grade', withUser({ _id: 't1' }), (req, res, next) => {
            req.params.submissionId = req.params.id; // align param name
            return gradeSubmission(req, res, next);
        }));
        const res = await request(app).patch('/api/assignments/submissions/s1/grade').send({ grade: 'A', feedback: 'Good' });
        expect(res.status).toBe(200);
        expectSuccessShape(res.body, { message: 'Submission graded successfully.' });
    });

    test('gradeSubmission 404 when submission missing', async () => {
        const app = buildApp((a) => a.patch('/api/assignments/submissions/:id/grade', withUser({ _id: 't1' }), (req, res, next) => {
            req.params.submissionId = req.params.id;
            return gradeSubmission(req, res, next);
        }));
        const res = await request(app).patch('/api/assignments/submissions/missing/grade').send({ grade: 'A' });
        expect(res.status).toBe(404);
    });
});
