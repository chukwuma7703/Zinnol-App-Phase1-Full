import request from 'supertest';
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../middleware/authMiddleware.js', () => ({
    __esModule: true,
    protect: (req, _res, next) => { req.user = { _id: 'teacher', role: 'TEACHER' }; next(); },
    authorizeRoles: () => (_req, _res, next) => next(),
    roles: { TEACHER: 'TEACHER', STUDENT: 'STUDENT' },
}));

vi.mock('../../controllers/assignmentController.js', () => ({
    __esModule: true,
    createAssignment: (_req, res) => res.status(201).json({ data: { _id: 'a1' } }),
    getAssignmentsForClass: (_req, res) => res.status(200).json({ data: [] }),
    getAssignment: (_req, res) => res.status(200).json({ data: { _id: 'a1' } }),
    updateAssignment: (_req, res) => res.status(200).json({ data: { _id: 'a1' } }),
    submitAssignment: (_req, res) => res.status(200).json({ data: { assignment: 'a1' } }),
    gradeSubmission: (_req, res) => res.status(200).json({ data: { grade: 95 } }),
}));

let app;
beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    const routes = (await import('../../routes/assignmentRoutes.js')).default;
    app.use('/api/assignments', routes);
});

describe('assignment routes smoke', () => {
    it('POST /api/assignments → 201 created (teacher role)', async () => {
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', 'Bearer x')
            .send({ title: 'HW 1' });
        expect(res.status).toBe(201);
        expect(res.body.data).toHaveProperty('_id');
    });

    it('GET /api/assignments/class/:classroomId → 200 list (teacher/student role)', async () => {
        const res = await request(app)
            .get('/api/assignments/class/c1')
            .set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/assignments/:id/submit → 200 submit (student role)', async () => {
        const res = await request(app)
            .post('/api/assignments/a1/submit')
            .set('Authorization', 'Bearer x')
            .send({ content: 'my work' });
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('assignment', 'a1');
    });

    it('PATCH /api/assignments/submissions/:submissionId/grade → 200 grade (teacher role)', async () => {
        const res = await request(app)
            .patch('/api/assignments/submissions/s1/grade')
            .set('Authorization', 'Bearer x')
            .send({ grade: 95 });
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('grade', 95);
    });
});
