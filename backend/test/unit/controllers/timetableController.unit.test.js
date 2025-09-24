import request from 'supertest';
import express from 'express';
import { vi } from 'vitest';
import { createTimetableEntry, getTimetable, deleteTimetableEntry } from '../../../controllers/timetableController.js';

// Mocks
vi.mock('../../../models/timetableModel.js', () => ({
    __esModule: true,
    default: {
        create: vi.fn(async (d) => ({ _id: 'tt1', ...d })),
        find: vi.fn(() => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => ([{ _id: 'tt1' }]) }) }) }) })),
        findById: vi.fn(async (id) => id === 'missing' ? null : ({ _id: id, school: 'sch1', deleteOne: vi.fn() })),
    }
}));

vi.mock('../../../config/cache.js', () => ({
    getCache: vi.fn(async () => null),
    setCache: vi.fn(async () => true)
}));

const withUser = (user) => (req, _res, next) => { req.user = user; next(); };
const build = (routes) => {
    const app = express();
    app.use(express.json());
    routes(app);
    app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    return app;
};
const expectOk = (body, msg) => {
    expect(body.success).toBe(true);
    expect(body.message).toBe(msg);
    expect(body.data).toBeDefined();
    const allowed = ['success', 'message', 'data', 'meta'];
    Object.keys(body).forEach(k => expect(allowed).toContain(k));
};
const expectError = (body, status, substr) => {
    expect(body.success).toBe(false);
    if (substr) expect(body.message).toMatch(new RegExp(substr, 'i'));
};

describe('timetableController ApiResponse', () => {
    test('createTimetableEntry 201 strict envelope', async () => {
        const app = build(a => a.post('/api/timetables', withUser({ school: 'sch1' }), createTimetableEntry));
        const res = await request(app).post('/api/timetables').send({ school: 'sch1', classroom: 'c1', subject: 'sub1', teacher: 't1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
        expect(res.status).toBe(201);
        expectOk(res.body, 'Timetable entry created successfully.');
        expect(res.body.data).toMatchObject({ school: 'sch1', classroom: 'c1' });
    });
    test('createTimetableEntry forbidden 403', async () => {
        const app = build(a => a.post('/api/timetables', withUser({ school: 'schX' }), createTimetableEntry));
        const res = await request(app).post('/api/timetables').send({ school: 'sch1', classroom: 'c1', subject: 's', teacher: 't', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
        expect(res.status).toBe(403);
        expectError(res.body, 403, 'forbidden');
    });
    test('getTimetable returns populated data', async () => {
        const app = build(a => a.get('/api/timetables', withUser({ school: 'sch1' }), getTimetable));
        const res = await request(app).get('/api/timetables');
        expect(res.status).toBe(200);
        expectOk(res.body, 'Timetable retrieved successfully.');
        expect(Array.isArray(res.body.data)).toBe(true);
    });
    test('deleteTimetableEntry success 200', async () => {
        const app = build(a => a.delete('/api/timetables/:id', withUser({ school: 'sch1' }), deleteTimetableEntry));
        const res = await request(app).delete('/api/timetables/tt1');
        expect(res.status).toBe(200);
        expectOk(res.body, 'Timetable entry deleted successfully.');
    });
    test('deleteTimetableEntry not found 404', async () => {
        const app = build(a => a.delete('/api/timetables/:id', withUser({ school: 'sch1' }), deleteTimetableEntry));
        const res = await request(app).delete('/api/timetables/missing');
        expect(res.status).toBe(404);
        expectError(res.body, 404, 'not found');
    });
});
