import request from 'supertest';
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Stub protect to inject a teacher role user
vi.mock('../../middleware/authMiddleware.js', () => ({
    __esModule: true,
    protect: (req, _res, next) => {
        // simulate valid bearer token
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return next({ status: 401, message: 'Unauthorized' });
        req.user = { _id: 'u1', role: 'TEACHER', school: 's1', tokenVersion: 0, isActive: true };
        next();
    },
    authorizeRoles: () => (_req, _res, next) => next(),
    roles: { TEACHER: 'TEACHER', STUDENT: 'STUDENT', GLOBAL_SUPER_ADMIN: 'GLOBAL_SUPER_ADMIN', MAIN_SUPER_ADMIN: 'MAIN_SUPER_ADMIN', SUPER_ADMIN: 'SUPER_ADMIN', PRINCIPAL: 'PRINCIPAL' },
}));

// Validation becomes a pass-through
vi.mock('../../middleware/validationMiddleware.js', () => ({
    __esModule: true,
    validate: () => (_req, _res, next) => next(),
    examSchemas: {},
}));

// Controller stubs
vi.mock('../../controllers/examController.js', () => ({
    __esModule: true,
    getExams: (_req, res) => res.status(200).json({ data: [{ title: 'Sample Exam' }] }),
    createExam: (req, res) => res.status(201).json({ data: { ...req.body, _id: 'e1' } }),
    startExam: (_req, res) => res.status(200).json({ message: 'Exam data retrieved. Ready to begin.' }),
    addQuestionToExam: vi.fn(),
    beginExam: vi.fn(),
    markStudentExam: vi.fn(),
    getExamSubmissions: vi.fn(),
    submitAnswer: vi.fn(),
    finalizeSubmission: vi.fn(),
    postExamScoreToResult: vi.fn(),
    adjustExamTime: vi.fn(),
    bulkPublishExamScores: vi.fn(),
    pauseExam: vi.fn(),
    resumeExam: vi.fn(),
    sendExamAnnouncement: vi.fn(),
    assignInvigilator: vi.fn(),
    removeInvigilator: vi.fn(),
    getInvigilators: vi.fn(),
    overrideAnswerScore: vi.fn(),
    endExam: vi.fn(),
}));

let app;
beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    const routes = (await import('../../routes/examRoutes.js')).default;
    app.use('/api/exams', routes);
});

describe('exam routes smoke', () => {
    it('GET /api/exams → 200 list', async () => {
        const res = await request(app).get('/api/exams').set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(res.body.data[0].title).toBe('Sample Exam');
    });

    it('POST /api/exams → 201 created', async () => {
        const res = await request(app).post('/api/exams').set('Authorization', 'Bearer x').send({ title: 'New Exam' });
        expect(res.status).toBe(201);
        expect(res.body.data.title).toBe('New Exam');
    });
});
