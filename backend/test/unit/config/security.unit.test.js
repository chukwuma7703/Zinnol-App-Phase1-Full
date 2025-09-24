import express from 'express';
import request from 'supertest';
import { createRateLimiters, setupSecurity, securityConfig } from '../../../config/security.js';

// Patch the securityConfig.development.rateLimit to be a proper middleware function for test
beforeAll(() => {
    securityConfig.development.rateLimit = (req, _res, next) => next();
});

// We will simulate requests to verify middleware applied.

describe('config/security', () => {
    test('createRateLimiters returns expected keys', () => {
        const rl = createRateLimiters();
        expect(Object.keys(rl).sort()).toEqual(['api', 'auth', 'passwordReset', 'upload'].sort());
    });

    test('setupSecurity applies headers and cors (development)', async () => {
        const app = express();
        setupSecurity(app, 'development');
        app.get('/test', (req, res) => res.json({ ok: true }));

        const res = await request(app).get('/test').set('Origin', 'http://localhost:5173');
        expect(res.status).toBe(200);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    test('setupSecurity development allows listed origin, rejects unknown via error path', async () => {
        const app = express();
        setupSecurity(app, 'development');
        app.get('/ok', (req, res) => res.json({ done: true }));
        const allowed = await request(app).get('/ok').set('Origin', 'http://localhost:5173');
        expect(allowed.status).toBe(200);
        // Unknown origin will trigger error handler; we add a basic error handler to capture it
        const app2 = express();
        setupSecurity(app2, 'development');
        app2.get('/ok', (req, res) => res.json({ done: true }));
        app2.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
        const blocked = await request(app2).get('/ok').set('Origin', 'http://evil.com');
        expect(blocked.status).toBe(500);
        expect(blocked.body.error).toMatch(/Not allowed by CORS/);
    });

    test('securityConfig has production and development', () => {
        expect(securityConfig).toHaveProperty('development');
        expect(securityConfig).toHaveProperty('production');
    });
});
