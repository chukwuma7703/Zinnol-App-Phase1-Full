import request from 'supertest';
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock the public controller
vi.mock('../../controllers/publicController.js', () => ({
    getSharedAnalytics: vi.fn((req, res) => {
        res.json({ ok: true, message: 'Analytics retrieved successfully' });
    })
}));

let app;
beforeAll(async () => {
    const express = (await import('express')).default;
    app = express();
    const routes = (await import('../../routes/publicRoutes.js')).default;
    app.use('/api/public', routes);
});

describe('public routes smoke', () => {
    it('GET /api/public/analytics/:token → 200', async () => {
        const res = await request(app).get('/api/public/analytics/abc');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ok', true);
    });
});
