import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../middleware/authMiddleware.js', () => ({
    __esModule: true,
    protect: (_req, _res, next) => next(),
    protectMfa: (_req, _res, next) => next(),
    authorizeRoles: () => (_req, _res, next) => next(),
    roles: { GLOBAL_SUPER_ADMIN: 'GLOBAL_SUPER_ADMIN', MAIN_SUPER_ADMIN: 'MAIN_SUPER_ADMIN', PRINCIPAL: 'PRINCIPAL' },
}));

vi.mock('../../controllers/userController.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        __esModule: true,
        ...actual,
        updateUserStatus: vi.fn(),
    };
});

let app;

beforeEach(async () => {
    app = express();
    app.use(express.json());
    const routes = (await import('../../routes/userRoutes.js')).default;
    app.use('/api/users', routes);
});

describe('userRoutes local error handler', () => {
    it('coalesces plain Error into 500 with message', async () => {
        const { updateUserStatus } = await import('../../controllers/userController.js');
        vi.mocked(updateUserStatus).mockImplementation(() => { throw new Error('boom'); });
        const res = await request(app)
            .put('/api/users/507f1f77bcf86cd799439011/status')
            .send({ active: true });
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('message');
        expect(res.body.message === 'boom' || res.body.message === 'Server Error').toBe(true);
    });

    it('uses statusCode when provided via next(err)', async () => {
        const { updateUserStatus } = await import('../../controllers/userController.js');
        vi.mocked(updateUserStatus).mockImplementation((_req, _res, next) => { next({ statusCode: 418, message: 'I am a teapot' }); });
        const res = await request(app)
            .put('/api/users/507f1f77bcf86cd799439011/status')
            .send({ active: true });
        expect(res.status).toBe(418);
        expect(res.body).toEqual({ message: 'I am a teapot' });
    });

    it('defaults message to "Server Error" when err.message missing', async () => {
        const { updateUserStatus } = await import('../../controllers/userController.js');
        vi.mocked(updateUserStatus).mockImplementation((_req, _res, next) => { next({ statusCode: 400 }); });
        const res = await request(app)
            .put('/api/users/507f1f77bcf86cd799439011/status')
            .send({ active: true });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Server Error' });
    });
});
