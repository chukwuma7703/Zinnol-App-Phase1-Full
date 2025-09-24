import request from 'supertest';
import express from 'express';
import { vi } from 'vitest';
import { createEvent, getEvents, updateEvent, deleteEvent } from '../../../controllers/eventController.js';

vi.mock('../../../models/eventModel.js', () => ({
    __esModule: true,
    default: {
        create: vi.fn(async d => ({ _id: 'e1', ...d })),
        find: vi.fn(() => ({ sort: () => ([{ _id: 'e1', title: 'School Fair' }]) })),
        findById: vi.fn(async (id) => {
            if (id === 'missing') return null;
            return { _id: id, school: { toString: () => 'sch1' }, remove: vi.fn(), deleteOne: vi.fn() };
        }),
        findByIdAndUpdate: vi.fn(async (id, body) => ({ _id: id, ...body, school: { toString: () => 'sch1' } })),
    }
}));

const withUser = (user) => (req, _res, next) => { req.user = user; next(); };
const build = (routes) => { const app = express(); app.use(express.json()); routes(app); app.use((err, _q, res, _n) => res.status(err.statusCode || 500).json({ success: false, message: err.message })); return app; };
const expectOk = (b, m) => { expect(b.success).toBe(true); expect(b.message).toBe(m); expect(b.data).toBeDefined(); };

describe('eventController ApiResponse', () => {
    beforeEach(async () => {
        const model = (await import('../../../models/eventModel.js')).default;
        model.findById = vi.fn(async (id) => {
            if (id === 'missing') return null;
            return { _id: id, school: { toString: () => 'sch1' }, remove: vi.fn(), deleteOne: vi.fn() };
        });
    });
    test('createEvent 201', async () => {
        const app = build(a => a.post('/api/events', withUser({ _id: 'u1', school: 'sch1' }), createEvent));
        const res = await request(app).post('/api/events').send({ title: 'T', date: '2025-01-01' });
        expect(res.status).toBe(201);
        expectOk(res.body, 'Event created successfully.');
    });
    test('getEvents 200', async () => {
        const app = build(a => a.get('/api/events', withUser({ _id: 'u1', school: 'sch1' }), getEvents));
        const res = await request(app).get('/api/events');
        expect(res.status).toBe(200);
        expectOk(res.body, 'Events retrieved successfully.');
    });
    test('updateEvent 200', async () => {
        const app = build(a => a.put('/api/events/:id', withUser({ _id: 'u1', school: 'sch1' }), updateEvent));
        const res = await request(app).put('/api/events/e1').send({ title: 'Updated' });
        expect(res.status).toBe(200);
        expectOk(res.body, 'Event updated successfully.');
    });
    test('updateEvent 404', async () => {
        const app = build(a => a.put('/api/events/:id', withUser({ _id: 'u1', school: 'sch1' }), updateEvent));
        const res = await request(app).put('/api/events/missing').send({ title: 'X' });
        expect(res.status).toBe(404);
    });
    test('updateEvent 401 cross-school', async () => {
        const app = build(a => a.put('/api/events/:id', withUser({ _id: 'u1', school: 'other' }), updateEvent));
        const res = await request(app).put('/api/events/e1').send({ title: 'Updated' });
        expect(res.status).toBe(401);
    });
    test('deleteEvent 404', async () => {
        const app = build(a => a.delete('/api/events/:id', withUser({ _id: 'u1', school: 'sch1' }), deleteEvent));
        const res = await request(app).delete('/api/events/missing');
        expect(res.status).toBe(404);
    });
    test('deleteEvent 200', async () => {
        const app = build(a => a.delete('/api/events/:id', withUser({ _id: 'u1', school: 'sch1' }), deleteEvent));
        const res = await request(app).delete('/api/events/e1');
        expect(res.status).toBe(200);
        expectOk(res.body, 'Event deleted successfully.');
    });
    test('deleteEvent 401 cross-school', async () => {
        const app = build(a => a.delete('/api/events/:id', withUser({ _id: 'u1', school: 'other' }), deleteEvent));
        const res = await request(app).delete('/api/events/e1');
        expect(res.status).toBe(401);
    });
});
