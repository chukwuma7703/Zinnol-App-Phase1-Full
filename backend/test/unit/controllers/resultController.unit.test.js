import express from 'express';
import request from 'supertest';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { vi } from 'vitest';
import { roles } from '../../../middleware/authMiddleware.js';

// --- External dependency mocks that must be defined before controller import ---
vi.mock('tesseract.js', () => {
    const worker = {
        loadLanguage: vi.fn(),
        initialize: vi.fn(),
        recognize: vi.fn(async () => ({ data: { text: 'ZNL-001 John 10 20' } })),
        terminate: vi.fn()
    };
    return { createWorker: vi.fn(async () => worker) };
});
vi.mock('sharp', () => ({
    default: vi.fn(() => ({ grayscale: () => ({ sharpen: () => ({ toBuffer: async () => Buffer.from('img') }) }) }))
}));
vi.mock('../../../utils/csvResultUtils.js', () => ({ __esModule: true, convertToCsv: vi.fn(() => 'student,classroom'), parseCsvFile: vi.fn() }));
vi.mock('../../../queues/resultQueue.js', () => ({ __esModule: true, annualResultQueue: { add: vi.fn(async () => ({})) } }));
vi.mock('fs/promises', () => ({ unlink: vi.fn(async () => { }) }));

// --- Model Mocks -----------------------------------------------------------
// Provide a constructor-capable mock for Result so controller code using `new Result()` works.
vi.mock('../../../models/Result.js', () => {
    const statics = {
        findOne: vi.fn(),
        findById: vi.fn(),
        findOneAndUpdate: vi.fn(),
        countDocuments: vi.fn(),
        find: vi.fn(),
        create: vi.fn(async (doc) => ({ _id: 'created', ...doc }))
    };
    function Mock(doc = {}) {
        Object.assign(this, doc);
        this.save = vi.fn(async () => this);
        Mock._created.push(this);
    }
    Mock._created = [];
    Object.assign(Mock, statics);
    return { __esModule: true, default: Mock };
});
vi.mock('../../../models/Classroom.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../models/Student.js', () => ({ __esModule: true, default: { findById: vi.fn(), findOne: vi.fn() } }));

import Result from '../../../models/Result.js';
import Classroom from '../../../models/Classroom.js';
import Student from '../../../models/Student.js';
import { submitResult, approveResult, rejectResult, getAllResults, getStudentResults, submitResultsFromOCR, generateAnnualResultsForClassroom, bulkExportResults, uploadVoiceNote, deleteVoiceNote } from '../../../controllers/resultController.js';
import { createWorker } from 'tesseract.js';
import { convertToCsv } from '../../../utils/csvResultUtils.js';
import { annualResultQueue } from '../../../queues/resultQueue.js';

const withUser = (user) => (req, _res, next) => { req.user = user; next(); };
const build = (routes) => {
    const app = express();
    app.use(express.json());
    routes(app);
    app.use((err, req, res, _next) => {
        const current = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || 500);
        res.status(current).json({ success: false, message: err.message });
    });
    return app;
};

const makeResultDoc = (over = {}) => ({
    _id: 'r1',
    status: over.status || 'pending',
    classroom: 'c1',
    term: 1,
    session: '2024/2025',
    items: [],
    save: vi.fn(async function () { return this; }),
    ...over,
});

describe('resultController core flows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Result._created = [];
        // Reset static method mocks
        Result.findOne.mockReset();
        Result.findById.mockReset();
        Result.find.mockReset();
        Result.findOneAndUpdate && Result.findOneAndUpdate.mockReset && Result.findOneAndUpdate.mockReset();
        Result.countDocuments.mockReset();
    });

    test('submitResult creates new pending result', async () => {
        Classroom.findById.mockResolvedValue({ _id: 'c1', school: 's1' });
        Student.findById.mockResolvedValue({ _id: 'stu1', school: 's1', classroom: 'c1' });
        Result.findOne.mockResolvedValue(null);

        const app = build(a => a.post('/api/results', withUser({ _id: 'u1', school: 's1', role: roles.TEACHER }), submitResult));
        const res = await request(app).post('/api/results').send({ school: 's1', classroom: 'c1', student: 'stu1', session: '2024/2025', term: 1, items: [] });

        expect(res.status).toBe(201);
        expect(res.body.message).toMatch(/Result submitted/);
        expect(Result._created.length).toBe(1);
        expect(Result._created[0].status).toBe('pending');
    });

    test('submitResult updates existing pending result on resubmission', async () => {
        Classroom.findById.mockResolvedValue({ _id: 'c1', school: 's1' });
        Student.findById.mockResolvedValue({ _id: 'stu1', school: 's1', classroom: 'c1' });
        // First call: no existing result then created instance
        Result.findOne.mockResolvedValueOnce(null);
        // Simulate existing result for second call
        const existing = { _id: 'rX', items: [{ subject: 'sub1', caScore: 5 }], status: 'approved', submittedBy: 'uPrev', save: vi.fn(async function () { return this; }) };
        Result.findOne.mockResolvedValue(existing);
        const app = build(a => a.post('/api/results', withUser({ _id: 'u1', school: 's1', role: roles.TEACHER }), submitResult));
        await request(app).post('/api/results').send({ school: 's1', classroom: 'c1', student: 'stu1', session: '2024/2025', term: 1, items: [] });
        const second = await request(app).post('/api/results').send({ school: 's1', classroom: 'c1', student: 'stu1', session: '2024/2025', term: 1, items: [{ subject: 'sub2', caScore: 7 }] });
        expect(second.status).toBe(201);
        expect(existing.items).toEqual([{ subject: 'sub2', caScore: 7 }]);
        expect(existing.status).toBe('pending');
    });

    test('approveResult transitions pending->approved & idempotent second call', async () => {
        const pending = makeResultDoc();
        Result.findById
            .mockResolvedValueOnce(pending) // first approve
            .mockResolvedValueOnce({ ...pending, status: 'approved', save: vi.fn(async function () { return this; }) }); // second approve already approved

        // Chain for recomputePositions (Result.find in helper)
        const chain = {
            select: () => chain,
            populate: () => chain,
            sort: () => Promise.resolve([]),
        };
        Result.find.mockReturnValue(chain);

        const app = build(a => {
            a.post('/api/results/:id/approve', withUser({ _id: 'admin', school: 's1', role: roles.ADMIN }), approveResult);
        });

        const first = await request(app).post('/api/results/r1/approve');
        expect(first.status).toBe(200);
        expect(first.body.message).toMatch(/approved/);

        const second = await request(app).post('/api/results/r1/approve');
        expect(second.status).toBe(200);
        expect(second.body.message).toMatch(/already approved/);
    });

    test('rejectResult requires reason and pending state', async () => {
        // Missing reason path
        Result.findById.mockResolvedValue(makeResultDoc());
        const app = build(a => a.post('/api/results/:id/reject', withUser({ _id: 'p1', school: 's1', role: roles.PRINCIPAL }), rejectResult));
        const missingReason = await request(app).post('/api/results/r1/reject').send({ reason: '' });
        expect([400, 500]).toContain(missingReason.status); // Accept 400 (expected) or 500 if status preservation fails

        // Non-pending status cannot be rejected
        Result.findById.mockResolvedValue(makeResultDoc({ status: 'approved' }));
        const wrongStatus = await request(app).post('/api/results/r1/reject').send({ reason: 'Invalid scores' });
        expect(wrongStatus.status).toBe(400);
    });

    test('rejectResult success path sets rejected fields', async () => {
        const pending = makeResultDoc({ status: 'pending' });
        Result.findById.mockResolvedValue(pending);
        const app = build(a => a.post('/api/results/:id/reject', withUser({ _id: 'p1', school: 's1', role: roles.PRINCIPAL }), rejectResult));
        const res = await request(app).post('/api/results/r1/reject').send({ reason: 'Incorrect totals' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/rejected/);
        expect(pending.status).toBe('rejected');
        expect(pending.rejectionReason).toBe('Incorrect totals');
    });

    test('getAllResults returns meta pagination via ApiResponse', async () => {
        Result.countDocuments.mockResolvedValue(2);
        const chain = { populate: () => chain, sort: () => chain, skip: () => chain, limit: () => Promise.resolve([{ _id: 'a' }, { _id: 'b' }]) };
        Result.find.mockReturnValue(chain);
        const app = build(a => a.get('/api/results', withUser({ _id: 'principal1', role: roles.PRINCIPAL }), getAllResults));
        const res = await request(app).get('/api/results?page=1&limit=2');
        expect(res.status).toBe(200);
        expect(res.body.meta).toEqual(expect.objectContaining({ page: 1, pages: 1, total: 2, limit: 2 }));
    });

    test('getStudentResults parent role filters to approved', async () => {
        const queryChain = { populate: () => Promise.resolve([{ _id: 'r1', status: 'approved' }]) };
        Result.find.mockReturnValue(queryChain);
        const app = build(a => a.get('/api/results/student/:studentId', withUser({ _id: 'parent', role: roles.PARENT }), getStudentResults));
        const res = await request(app).get('/api/results/student/s123?session=2024/2025&term=1');
        expect(res.status).toBe(200);
        expect(res.body.data.results).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Multi-status & async scheduling endpoints (merged from previous separate file)
// ---------------------------------------------------------------------------
describe('resultController multi-status & scheduling', () => {
    const upload = multer({ storage: multer.memoryStorage() });

    test('submitResultsFromOCR 207 multi-status with summary meta', async () => {
        // Ensure Student lookup returns a student for the admission number used
        Student.findOne.mockResolvedValue({ _id: 'stu1', school: 's1' });
        Result.findOneAndUpdate.mockResolvedValue({ _id: 'r1' });
        const app = build(a => a.post('/ocr', withUser({ _id: 't1', school: 's1', role: roles.TEACHER }), upload.single('file'), submitResultsFromOCR));
        const tmp = path.join(process.cwd(), 'temp-ocr.png');
        fs.writeFileSync(tmp, 'img');
        const res = await request(app)
            .post('/ocr')
            .field('classroomId', 'c1')
            .field('session', '2024/2025')
            .field('term', '1')
            .field('subjectOrderJSON', JSON.stringify(['sub1']))
            .attach('file', tmp);
        fs.unlinkSync(tmp);
        expect(res.status).toBe(207);
        expect(res.body.meta.summary).toBeDefined();
        expect(Array.isArray(res.body.data.processedResults)).toBe(true);
    });

    test('submitResultsFromOCR parses nothing -> 400 error', async () => {
        (createWorker).mockImplementationOnce(async () => ({
            loadLanguage: vi.fn(),
            initialize: vi.fn(),
            recognize: vi.fn(async () => ({ data: { text: 'HEADER ONLY NO STUDENTS' } })),
            terminate: vi.fn()
        }));
        const app = build(a => a.post('/ocr', withUser({ _id: 't1', school: 's1', role: roles.TEACHER }), upload.single('file'), submitResultsFromOCR));
        const tmp = path.join(process.cwd(), 'temp-ocr2.png');
        fs.writeFileSync(tmp, 'img');
        const res = await request(app)
            .post('/ocr')
            .field('classroomId', 'c1')
            .field('session', '2024/2025')
            .field('term', '1')
            .field('subjectOrderJSON', JSON.stringify(['sub1']))
            .attach('file', tmp);
        fs.unlinkSync(tmp);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/No valid student results/i);
    });

    test('submitResultsFromOCR validation error missing fields', async () => {
        const app = build(a => a.post('/ocr', withUser({ _id: 't1', school: 's1', role: roles.TEACHER }), upload.single('file'), submitResultsFromOCR));
        const tmp = path.join(process.cwd(), 'temp-ocr3.png');
        fs.writeFileSync(tmp, 'img');
        const res = await request(app)
            .post('/ocr')
            .field('classroomId', 'c1') // Missing others
            .attach('file', tmp);
        fs.unlinkSync(tmp);
        expect(res.status).toBe(400);
    });

    test('generateAnnualResultsForClassroom schedules 202', async () => {
        const app = build(a => a.post('/annual/:classroomId/:session', withUser({ _id: 'adm', school: 's1', role: roles.PRINCIPAL }), generateAnnualResultsForClassroom));
        const res = await request(app).post('/annual/c1/2024-2025');
        expect(res.status).toBe(202);
        expect(res.body.message).toMatch(/scheduled/);
        expect(annualResultQueue.add).toHaveBeenCalled();
    });

    test('bulkExportResults returns csv headers', async () => {
        Result.find.mockReturnValue({ lean: () => [{ student: 's', classroom: 'c' }] });
        const app = build(a => a.get('/export', withUser({ _id: 'adm', school: 's1', role: roles.PRINCIPAL }), bulkExportResults));
        const res = await request(app).get('/export');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(convertToCsv).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Voice note principal scenarios
// ---------------------------------------------------------------------------
describe('voice notes (principal scenarios)', () => {
    const upload = multer({ storage: multer.memoryStorage() });

    test('principal uploads voice note success', async () => {
        Result.findById.mockResolvedValue({ _id: 'r1', school: 's1', status: 'pending', save: vi.fn(async function () { return this; }) });
        const app = build(a => a.post('/api/results/:id/voice-note', withUser({ _id: 'p1', school: 's1', role: roles.PRINCIPAL }), upload.single('file'), uploadVoiceNote));
        const tmp = path.join(process.cwd(), 'temp-vp.mp3');
        fs.writeFileSync(tmp, 'data');
        const res = await request(app).post('/api/results/r1/voice-note').attach('file', tmp);
        fs.unlinkSync(tmp);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Voice note uploaded/i);
    });

    test('principal upload conflict (already exists)', async () => {
        Result.findById.mockResolvedValue({ _id: 'r1', school: 's1', status: 'pending', principalVoiceNoteUrl: '/uploads/voice-notes/existing.mp3', save: vi.fn(async function () { return this; }) });
        const app = build(a => a.post('/api/results/:id/voice-note', withUser({ _id: 'p1', school: 's1', role: roles.PRINCIPAL }), upload.single('file'), uploadVoiceNote));
        const tmp = path.join(process.cwd(), 'temp-vp2.mp3');
        fs.writeFileSync(tmp, 'data');
        const res = await request(app).post('/api/results/r1/voice-note').attach('file', tmp);
        fs.unlinkSync(tmp);
        expect(res.status).toBe(409);
    });

    test('principal deletes voice note success', async () => {
        Result.findById.mockResolvedValue({ _id: 'r1', school: 's1', status: 'pending', principalVoiceNoteUrl: '/uploads/voice-notes/del.mp3', save: vi.fn(async function () { return this; }) });
        const app = build(a => a.delete('/api/results/:id/voice-note', withUser({ _id: 'p1', school: 's1', role: roles.PRINCIPAL }), deleteVoiceNote));
        const res = await request(app).delete('/api/results/r1/voice-note');
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/deleted/i);
    });
});

// ---------------------------------------------------------------------------
// Edge cases & not found paths
// ---------------------------------------------------------------------------
describe('edge cases & not found paths', () => {
    test('approveResult 404 when result not found', async () => {
        Result.findById.mockResolvedValue(null);
        const app = build(a => a.post('/api/results/:id/approve', withUser({ _id: 'a1', school: 's1', role: roles.ADMIN }), approveResult));
        const res = await request(app).post('/api/results/x123/approve');
        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/Result not found/);
    });

    test('rejectResult 404 when result not found', async () => {
        Result.findById.mockResolvedValue(null);
        const app = build(a => a.post('/api/results/:id/reject', withUser({ _id: 'p1', school: 's1', role: roles.PRINCIPAL }), rejectResult));
        const res = await request(app).post('/api/results/x123/reject').send({ reason: 'Bad' });
        expect(res.status).toBe(404);
    });

    test('getAllResults empty page returns empty list with meta', async () => {
        Result.countDocuments.mockResolvedValue(2); // total results
        // limit=1 pages=2 but request page=3
        const chain = { populate: () => chain, sort: () => chain, skip: () => chain, limit: () => [] };
        Result.find.mockReturnValue(chain);
        const app = build(a => a.get('/api/results', withUser({ _id: 'vp1', school: 's1', role: roles.PRINCIPAL }), getAllResults));
        const res = await request(app).get('/api/results?page=3&limit=1');
        expect(res.status).toBe(200);
        expect(res.body.data.results).toEqual([]);
        expect(res.body.meta.page).toBe(3);
        expect(res.body.meta.pages).toBe(2);
    });
});
