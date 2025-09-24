import request from 'supertest';
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../middleware/authMiddleware.js', () => ({
    __esModule: true,
    protect: (req, _res, next) => { req.user = { _id: 'admin', role: 'GLOBAL_SUPER_ADMIN' }; next(); },
    authorizeRoles: () => (_req, _res, next) => next(),
    roles: { GLOBAL_SUPER_ADMIN: 'GLOBAL_SUPER_ADMIN' },
}));

vi.mock('../../controllers/analysisController.js', () => ({
    __esModule: true,
    getGlobalOverviewAnalytics: (_req, res) => res.status(200).json({ ok: true }),
    getSystemWideAnalytics: (_req, res) => res.status(200).json({ ok: true }),
    getStudentAnalytics: (_req, res) => res.status(200).json({ ok: true }),
    getTeacherAnalytics: (_req, res) => res.status(200).json({ ok: true }),
    getSchoolDashboardAnalytics: (_req, res) => res.status(200).json({ ok: true }),
    queryStudents: (_req, res) => res.status(200).json({ ok: true }),
    createShareableLink: (_req, res) => res.status(200).json({ ok: true }),
    getTeacherActivityAnalytics: (_req, res) => res.status(200).json({ ok: true }),
    getTimetableCompliance: (_req, res) => res.status(200).json({ ok: true }),
    getSchoolAcademicTerms: (_req, res) => res.status(200).json({ ok: true }),
    getAllAcademicSessions: (_req, res) => res.status(200).json({ ok: true }),
    getClassroomLeaderboard: (_req, res) => res.status(200).json({ ok: true }),
    getDecliningStudents: (_req, res) => res.status(200).json({ ok: true }),
    getStudentExamHistory: (_req, res) => res.status(200).json({ ok: true }),
}));

let app;
beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    const routes = (await import('../../routes/analyticsRoutes.js')).default;
    app.use('/api/analytics', routes);
});

describe('analytics routes smoke', () => {
    it('GET /api/analytics/global-overview', async () => {
        const res = await request(app).get('/api/analytics/global-overview').set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('GET /api/analytics/system-wide', async () => {
        const res = await request(app).get('/api/analytics/system-wide').set('Authorization', 'Bearer x');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});
