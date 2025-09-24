import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import asyncHandler from 'express-async-handler';
import { vi } from 'vitest';

// Controller under test
import { getOrgSettings, updateOrgSettings } from '../../../controllers/settingsController.js';

// Mock OrgSettings model
vi.mock('../../../models/orgSettingsModel.js', () => ({
    __esModule: true,
    default: {
        findOne: vi.fn(),
        create: vi.fn(),
    },
}));

import OrgSettings from '../../../models/orgSettingsModel.js';

// Minimal ok() response shape is already in controller; we just assert output

// Helper auth middleware to inject req.user
const withUser = (user) => (req, _res, next) => { req.user = user; next(); };

// Build a tiny express app for testing handlers
const buildApp = (routeBuilder) => {
    const app = express();
    app.use(bodyParser.json());
    routeBuilder(app);
    // central error handler
    app.use((err, _req, res, _next) => {
        res.status(err.statusCode || 500).json({ success: false, message: err.message });
    });
    return app;
};

const expectOk = (res, msg) => {
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');
    if (msg) expect(res.body.message).toMatch(msg);
    expect(res.body).toHaveProperty('data');
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('settingsController', () => {
    test('getOrgSettings returns defaults when none exists', async () => {
        OrgSettings.findOne.mockResolvedValueOnce(null);
        const app = buildApp((a) => a.get('/api/settings/org', getOrgSettings));
        const res = await request(app).get('/api/settings/org');
        expect(res.status).toBe(200);
        expectOk(res, /Default settings|Org settings/);
        expect(res.body.data).toHaveProperty('organizationName');
        expect(res.body.data).toHaveProperty('supportEmail');
    });

    test('updateOrgSettings creates when missing', async () => {
        OrgSettings.findOne.mockResolvedValueOnce(null);
        OrgSettings.create.mockResolvedValueOnce({ _id: '1', organizationName: 'Zinnol', supportEmail: 'team@zinnol.com' });
        const app = buildApp((a) => a.put('/api/settings/org', withUser({ _id: 'u1' }), updateOrgSettings));
        const res = await request(app).put('/api/settings/org').send({ organizationName: 'Zinnol', supportEmail: 'team@zinnol.com' });
        expect(res.status).toBe(200);
        expectOk(res, /updated/);
        expect(OrgSettings.create).toHaveBeenCalledWith(expect.objectContaining({ organizationName: 'Zinnol', supportEmail: 'team@zinnol.com' }));
    });

    test('updateOrgSettings updates existing doc', async () => {
        const save = vi.fn();
        OrgSettings.findOne.mockResolvedValueOnce({ _id: '1', organizationName: 'Old', supportEmail: 'old@z.com', save });
        const app = buildApp((a) => a.put('/api/settings/org', withUser({ _id: 'u1' }), updateOrgSettings));
        const res = await request(app).put('/api/settings/org').send({ organizationName: 'New Name', supportEmail: 'new@z.com' });
        expect(res.status).toBe(200);
        expectOk(res, /updated/);
        expect(save).toHaveBeenCalled();
    });

    test('updateOrgSettings validates input', async () => {
        const app = buildApp((a) => a.put('/api/settings/org', withUser({ _id: 'u1' }), updateOrgSettings));
        const res = await request(app).put('/api/settings/org').send({ organizationName: '', supportEmail: 'not-an-email' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
