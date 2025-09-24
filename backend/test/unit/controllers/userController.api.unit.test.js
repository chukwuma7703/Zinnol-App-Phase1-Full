import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { vi } from 'vitest';
import { registerUser, loginUser, getMe, createUser } from '../../../controllers/userController.js';
import AppError from '../../../utils/AppError.js';

vi.mock('bcryptjs', () => ({
    hash: vi.fn(async () => 'hashed-password'),
    compare: vi.fn(async () => true)
}));

vi.mock('../../../models/userModel.js', () => {
    const MockUser = vi.fn();
    MockUser.countDocuments = vi.fn(async () => 0);
    MockUser.findOne = vi.fn(async ({ email }) => (email === 'exists@test.com' ? ({ _id: 'dup' }) : null));
    MockUser.create = vi.fn(async (d) => ({ _id: 'u1', ...d, save: vi.fn(async () => ({ _id: 'u1', ...d })) }));
    MockUser.findById = vi.fn(async () => ({ _id: 'u1', name: 'Test', email: 't@test.com', role: 'Global Super Admin', school: null }));
    return { __esModule: true, default: MockUser };
});

vi.mock('../../../models/refreshTokenModel.js', () => {
    const MockRefreshToken = vi.fn();
    MockRefreshToken.create = vi.fn(async () => ({}));
    MockRefreshToken.hashToken = (t) => 'hash-' + t;
    return { __esModule: true, default: MockRefreshToken };
});

vi.mock('../../../utils/generateToken.js', () => ({
    generateAccessToken: vi.fn(() => 'access-token'),
    generateRefreshToken: vi.fn(() => 'refresh-token'),
    generateDeviceToken: vi.fn(() => 'device-token')
}));

const withUser = (user) => (req, _res, next) => { req.user = user; next(); };

const build = (routes) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    routes(app);
    app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    return app;
};

const expectOk = (body, msg) => { expect(body.success).toBe(true); expect(body.message).toBe(msg); expect(body.data).toBeDefined(); };

describe('userController ApiResponse subset', () => {
    test('registerUser returns created envelope', async () => {
        const app = build(a => a.post('/api/users/register', registerUser));
        const res = await request(app).post('/api/users/register').send({ name: 'N', email: 'e@test.com', password: 'p' });
        expect(res.status).toBe(201);
        expectOk(res.body, 'User registered successfully.');
        expect(res.body.data.accessToken).toBe('access-token');
    });

    test('loginUser success envelope', async () => {
        const userModel = (await import('../../../models/userModel.js')).default;
        userModel.findOne = vi.fn(() => ({
            select: vi.fn(() => ({
                _id: 'u1', name: 'N', email: 'e@test.com', role: 'Student', school: null,
                isActive: true, isMfaEnabled: false,
                matchPassword: async () => true,
                save: vi.fn()
            }))
        }));
        const app = build(a => a.post('/api/users/login', loginUser));
        const res = await request(app).post('/api/users/login').send({ email: 'e@test.com', password: 'p' });
        expect(res.status).toBe(200);
        expectOk(res.body, 'Login successful.');
        expect(res.body.data.refreshToken).toBe('refresh-token');
    });

    test('getMe returns profile envelope', async () => {
        const app = build(a => a.get('/api/users/me', withUser({ _id: 'u1', name: 'N', email: 'e@test.com', role: 'Student', school: null, isActive: true, createdAt: 'now', updatedAt: 'now' }), getMe));
        const res = await request(app).get('/api/users/me');
        expect(res.status).toBe(200);
        expectOk(res.body, 'User profile retrieved.');
        expect(res.body.data.email).toBe('e@test.com');
    });

    test('createUser returns 201 envelope', async () => {
        const userModel = (await import('../../../models/userModel.js')).default;
        userModel.findOne = vi.fn(async () => null); // ensure email unique
        const app = build(a => a.post('/api/users', createUser));
        const res = await request(app).post('/api/users').send({ name: 'A', email: 'a@test.com', password: 'p', role: 'TEACHER' });
        expect(res.status).toBe(201);
        expectOk(res.body, 'User created successfully.');
    });
});
