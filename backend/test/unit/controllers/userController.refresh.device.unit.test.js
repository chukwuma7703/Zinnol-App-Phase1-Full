import { vi, describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Mocks
vi.mock('../../../models/refreshTokenModel.js', () => ({
    __esModule: true,
    default: {
        create: vi.fn().mockResolvedValue({}),
        findOne: vi.fn(),
        updateMany: vi.fn(),
        findOneAndUpdate: vi.fn(),
        hashToken: vi.fn(() => 'hashed'),
    },
}));

vi.mock('../../../models/userModel.js', () => ({
    __esModule: true,
    default: {
        findById: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ _id: 'u1', isActive: true, tokenVersion: 1, role: 'Teacher' }) })),
    },
}));

vi.mock('jsonwebtoken', () => ({
    __esModule: true,
    default: {
        sign: vi.fn((p, s, o) => 'tkn'),
        verify: vi.fn((t, s) => ({ id: 'u1', tokenVersion: 1, type: t === 'dev' ? 'device' : undefined })),
    },
}));

vi.mock('../../../utils/generateToken.js', () => ({
    __esModule: true,
    generateAccessToken: vi.fn(() => 'access-new'),
    generateRefreshToken: vi.fn(() => 'refresh-new'),
    generateDeviceToken: vi.fn(() => 'device-new'),
}));

let app;

describe('userController.refresh device fallback', () => {
    beforeEach(async () => {
        vi.resetModules();
        const { refreshToken } = await import('../../../controllers/userController.js');
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        // Mount the controller directly to avoid unrelated middleware
        app.post('/api/users/refresh', refreshToken);
    });

    it('falls back to deviceToken when refreshToken missing and issues new tokens', async () => {
        const request = (await import('supertest')).default;
        // Set deviceToken via Cookie header to avoid stack mutation flakiness
        const res = await request(app)
            .post('/api/users/refresh')
            .set('Cookie', ['deviceToken=dev']);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('accessToken', 'access-new');
    });
});
