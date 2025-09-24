import request from 'supertest';
import express from 'express';
import { vi } from 'vitest';
import { createSubject, getSubjects, getSubjectById, updateSubject, deleteSubject } from '../../../controllers/subjectController.js';

// In-memory mock store to simulate subjects
const mockStore = {
    sExisting: { _id: 'sExisting', school: 'sch1', name: 'Existing', code: 'EXS', save: vi.fn(async function () { return this; }), deleteOne: vi.fn(async () => { }) },
    sOther: { _id: 'sOther', school: 'sch1', name: 'Other', code: 'OTR', save: vi.fn(async function () { return this; }), deleteOne: vi.fn(async () => { }) },
};

vi.mock('../../../models/Subject.js', () => ({
    __esModule: true,
    default: {
        findOne: vi.fn(async (q) => {
            if (q.code === 'DUP') return { _id: 'dupId' };
            if (q.code === 'OTR') return mockStore.sOther; // conflict case
            if (q._id === 'missing') return null;
            if (q._id === 'sExisting') return mockStore.sExisting;
            if (q._id && q.school) return null; // unmatched id for that school
            if (q.code) return null; // creating new subject (no duplicate except above)
            return null;
        }),
        create: vi.fn(async (d) => ({ _id: 'newSub', ...d })),
        countDocuments: vi.fn(async () => 2),
        find: vi.fn(() => ({
            limit: function () { return { skip: () => ({ sort: () => ([mockStore.sExisting, mockStore.sOther]) }) }; }
        })),
    }
}));

const withUser = (user) => (req, _res, next) => { req.user = user; next(); };
const build = (routes) => {
    const app = express();
    app.use(express.json());
    routes(app);
    app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
    return app;
};
const expectOk = (body, msg) => { expect(body.success).toBe(true); expect(body.message).toBe(msg); expect(body.data).toBeDefined(); };

describe('subjectController ApiResponse (enhanced)', () => {
    test('createSubject normalizes code uppercase & returns 201', async () => {
        const app = build(a => a.post('/api/subjects', withUser({ school: 'sch1' }), createSubject));
        const res = await request(app).post('/api/subjects').send({ name: 'Math', code: 'mth', maxMark: 50 });
        expect(res.status).toBe(201);
        expectOk(res.body, 'Subject created successfully.');
        expect(res.body.data.code).toBe('MTH');
    });

    test('createSubject duplicate 400', async () => {
        const app = build(a => a.post('/api/subjects', withUser({ school: 'sch1' }), createSubject));
        const res = await request(app).post('/api/subjects').send({ name: 'Dup', code: 'dup' });
        expect(res.status).toBe(400);
    });

    test('createSubject maxMark invalid 400', async () => {
        const app = build(a => a.post('/api/subjects', withUser({ school: 'sch1' }), createSubject));
        const res = await request(app).post('/api/subjects').send({ name: 'Sci', code: 'SCI', maxMark: 0 });
        expect(res.status).toBe(400);
    });

    test('getSubjects returns items + pagination meta', async () => {
        const app = build(a => a.get('/api/subjects', withUser({ school: 'sch1' }), getSubjects));
        const res = await request(app).get('/api/subjects?page=1&limit=5');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 5, total: 2, pages: 1 });
    });

    test('getSubjectById 200', async () => {
        const app = build(a => a.get('/api/subjects/:id', withUser({ school: 'sch1' }), getSubjectById));
        const res = await request(app).get('/api/subjects/sExisting');
        expect(res.status).toBe(200);
        expectOk(res.body, 'Subject retrieved successfully.');
    });

    test('getSubjectById 404', async () => {
        const app = build(a => a.get('/api/subjects/:id', withUser({ school: 'sch1' }), getSubjectById));
        const res = await request(app).get('/api/subjects/missing');
        expect(res.status).toBe(404);
    });

    test('updateSubject success with code normalization', async () => {
        const app = build(a => a.put('/api/subjects/:id', withUser({ school: 'sch1' }), updateSubject));
        const res = await request(app).put('/api/subjects/sExisting').send({ name: 'Advanced Existing', code: 'adv' });
        expect(res.status).toBe(200);
        expectOk(res.body, 'Subject updated successfully.');
        expect(res.body.data.code).toBe('ADV');
    });

    test('updateSubject maxMark invalid 400', async () => {
        const app = build(a => a.put('/api/subjects/:id', withUser({ school: 'sch1' }), updateSubject));
        const res = await request(app).put('/api/subjects/sExisting').send({ maxMark: -10 });
        expect(res.status).toBe(400);
    });

    test('updateSubject code conflict 400', async () => {
        const app = build(a => a.put('/api/subjects/:id', withUser({ school: 'sch1' }), updateSubject));
        const res = await request(app).put('/api/subjects/sExisting').send({ code: 'otr' });
        expect(res.status).toBe(400);
    });

    test('updateSubject 404', async () => {
        const app = build(a => a.put('/api/subjects/:id', withUser({ school: 'sch1' }), updateSubject));
        const res = await request(app).put('/api/subjects/missing').send({ name: 'No' });
        expect(res.status).toBe(404);
    });

    test('deleteSubject 200', async () => {
        const app = build(a => a.delete('/api/subjects/:id', withUser({ school: 'sch1' }), deleteSubject));
        const res = await request(app).delete('/api/subjects/sExisting');
        expect(res.status).toBe(200);
        expectOk(res.body, 'Subject deleted successfully.');
    });

    test('deleteSubject 404', async () => {
        const app = build(a => a.delete('/api/subjects/:id', withUser({ school: 'sch1' }), deleteSubject));
        const res = await request(app).delete('/api/subjects/missing');
        expect(res.status).toBe(404);
    });
});
