import request from 'supertest';
import http from 'http';
import { vi } from 'vitest';

// Mock monitoring before importing server
vi.mock('../config/monitoring.js', () => ({
    __esModule: true,
    detailedHealthCheck: vi.fn(),
    metricsMiddleware: vi.fn((req, res, next) => next()),
    metricsEndpoint: vi.fn((req, res) => res.status(200).send('# HELP test_metric\n# TYPE test_metric counter\ntest_metric 1')),
    initializeMetrics: vi.fn()
}));

import app, { server as rawServer } from '../server.js';
import { detailedHealthCheck } from '../config/monitoring.js';

// We only test behaviour that is active when NODE_ENV === 'test'.
// server.js guards side-effectful initialisations (DB, Redis, cron, sockets) in tests.
// These assertions focus on:
//  - Export shape (app instance)
//  - Basic health & status endpoints
//  - Readiness endpoint with health checks
//  - 404 handler and JSON structure
//  - Security headers (helmet) presence
//  - Metrics endpoint basic reachability
//
// NOTE: We import server.js directly so the top-level code executes with test guards.

describe('server.js (unit/light integration)', () => {
    let server;

    beforeAll(() => {
        // Create a dedicated ephemeral server so we can test real HTTP headers if needed
        server = http.createServer(app);
    });

    afterAll((done) => {
        if (server && server.listening) {
            server.close(done);
        } else {
            done();
        }
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('exports app and server objects', () => {
        expect(app).toBeDefined();
        expect(rawServer).toBeDefined();
    });

    test('GET / responds with API status payload', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Zinnol API Server');
        expect(res.body).toHaveProperty('health', '/healthz');
    });

    test('GET /healthz returns healthy status structure', async () => {
        const res = await request(app).get('/healthz');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('environment');
    });

    test('GET /readyz returns healthy status when cache is connected (actual current behavior)', async () => {
        detailedHealthCheck.mockResolvedValue({
            status: 'healthy',
            cache: { status: 'connected' },
            database: { status: 'connected' },
            uptime: 123.45
        });

        const res = await request(app).get('/readyz');

        expect(res.status).toBe(200);
        // Implementation currently returns 'healthy' so align expectation
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('cache');
        expect(res.body).toHaveProperty('database');
        expect(detailedHealthCheck).toHaveBeenCalled();
    });

    test('GET /readyz returns unhealthy status when cache is disconnected (actual current behavior)', async () => {
        detailedHealthCheck.mockResolvedValue({
            status: 'unhealthy',
            cache: { status: 'disconnected' },
            database: { status: 'connected' },
            uptime: 123.45
        });

        const res = await request(app).get('/readyz');

        expect(res.status).toBe(503);
        // Implementation currently returns 'unhealthy'
        expect(res.body).toHaveProperty('status', 'unhealthy');
        expect(res.body).toHaveProperty('cache');
        expect(res.body.cache.status).toBe('disconnected');
        expect(detailedHealthCheck).toHaveBeenCalled();
    });

    test('GET /readyz handles health check errors gracefully', async () => {
        vi.setConfig({ testTimeout: 5000 });
        detailedHealthCheck.mockImplementationOnce(() => Promise.reject(new Error('Health check failed')));
        const res = await request(app).get('/readyz');
        // Expect a failure status; implementation may choose 500 or 503
        expect([500, 503]).toContain(res.status);
        expect(detailedHealthCheck).toHaveBeenCalled();
    });

    test('GET /metrics is reachable (text/plain or exposition format)', async () => {
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(200);
        // Content type could vary; just ensure some body content exists.
        expect(res.text.length).toBeGreaterThan(10);
    });

    test('helmet security headers applied', async () => {
        const res = await request(app).get('/');
        // X-DNS-Prefetch-Control and X-Content-Type-Options typically set by helmet
        expect(res.headers).toHaveProperty('x-dns-prefetch-control');
        expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
        expect(res.headers).toHaveProperty('x-frame-options');
    });

    test('unknown route returns JSON 404 with message', async () => {
        const res = await request(app).get('/__not_found__');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('success', false);
        expect(res.body.message).toMatch(/Route not found/);
    });
});
