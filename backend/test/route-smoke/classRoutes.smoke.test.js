import request from 'supertest';
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock auth middleware
vi.mock('../../middleware/authMiddleware.js', () => ({
    __esModule: true,
    protect: vi.fn((req, res, next) => {
        req.user = { id: 'user123', role: 'Teacher' };
        next();
    }),
    authorizeRoles: vi.fn(() => (req, res, next) => next()),
    roles: {}
}));

// Mock class controller
vi.mock('../../controllers/classController.js', () => ({
    __esModule: true,
    getClasses: vi.fn((req, res) => {
        res.json({ data: [{ _id: 'class123', name: 'Test Class' }] });
    }),
    createClass: vi.fn((req, res) => {
        res.status(201).json({ data: { _id: 'newClass123', name: req.body.name } });
    }),
    createClassroom: vi.fn((req, res) => {
        res.status(201).json({ data: { _id: 'newClass123', name: req.body.name } });
    }),
    getClassrooms: vi.fn((req, res) => {
        res.json({ data: [{ _id: 'class123', name: 'Test Class' }] });
    }),
    updateClassroom: vi.fn(),
    deleteClassroom: vi.fn()
}));

let app;
beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    app.use(express.json());
    const routes = (await import('../../routes/classRoutes.js')).default;
    app.use('/api/classes', routes);
});

describe('class routes smoke', () => {
    it('GET /api/classes → 200 list (requires auth header)', async () => {
        const res = await request(app).get('/api/classes').set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toHaveProperty('_id');
    });

    it('POST /api/classes → 201 created (requires auth header)', async () => {
        const res = await request(app)
            .post('/api/classes')
            .set('Authorization', 'Bearer x')
            .send({ name: 'JSS2 A' });
        expect(res.status).toBe(201);
        expect(res.body.data).toHaveProperty('_id');
    });
});
