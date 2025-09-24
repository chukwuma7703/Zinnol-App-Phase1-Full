import express from 'express';
import request from 'supertest';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { vi } from 'vitest';
// We'll import controller exports after potential vi.doMock in specific tests when needed.
import { bulkImportResults, getAllResults, parseOcrText } from '../../../controllers/resultController.js';
import { roles } from '../../../middleware/authMiddleware.js';

// Mocks
vi.mock('../../../models/Result.js', () => ({ __esModule: true, default: { create: vi.fn(), countDocuments: vi.fn(), find: vi.fn() } }));
vi.mock('../../../models/AnnualResult.js', () => ({ __esModule: true, default: { create: vi.fn(), find: vi.fn() } }));
vi.mock('../../../models/Student.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../models/Classroom.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
vi.mock('../../../models/userModel.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));
import Result from '../../../models/Result.js';

const withUser = (user) => (req, _res, next) => { req.user = user; next(); };
const appFactory = (routes) => {
    const app = express();
    app.use(express.json());
    routes(app);
    app.use((err, req, res, _next) => {
        const status = res.statusCode !== 200 ? res.statusCode : (err.statusCode || 500);
        res.status(status).json({ success: false, message: err.message });
    });
    return app;
};

describe('bulkImportResults', () => {
    test('returns error when no file uploaded', async () => {
        const app = appFactory(a => a.post('/bulk', withUser({ _id: 'u1' }), bulkImportResults));
        const res = await request(app).post('/bulk');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/No CSV file/);
    });

    test('imports rows and reports errors', async () => {
        vi.resetModules();
        vi.doMock('../../../utils/csvResultUtils.js', () => ({
            __esModule: true, parseCsvFile: vi.fn().mockResolvedValue([
                { student: 's1', classroom: 'c1', session: '2024/2025', term: 1, subject: 'sub', examScore: 40 },
                { student: 's2' } // invalid
            ]), convertToCsv: vi.fn()
        }));
        const { bulkImportResults: bulkImport } = await import('../../../controllers/resultController.js');
        Result.create.mockResolvedValue({ _id: 'r1' });
        const upload = multer({ storage: multer.memoryStorage() });
        const app = appFactory(a => a.post('/bulk', withUser({ _id: 'u1' }), upload.single('file'), bulkImport));
        const tmpPath = path.join(process.cwd(), 'temp.csv');
        fs.writeFileSync(tmpPath, 'header');
        const res = await request(app).post('/bulk').attach('file', tmpPath);
        fs.unlinkSync(tmpPath);
        expect(res.status).toBe(200);
        expect(res.body.data.imported).toBe(1);
        expect(res.body.data.errors.length).toBe(1);
    });
});

describe('parseOcrText', () => {
    test('parses valid line with subjects', () => {
        const line = 'ZNL-001 John Doe 10 20 15 25';
        const { results, errors } = parseOcrText(line, ['sub1', 'sub2']);
        expect(errors.length).toBe(0);
        expect(results[0].items.length).toBe(2);
    });
    test('records error for insufficient scores', () => {
        const line = 'ZNL-002 Jane Doe 10';
        const { results, errors } = parseOcrText(line, ['sub1', 'sub2']);
        expect(results.length).toBe(0);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('getAllResults scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    test('forbidden for teacher role', async () => {
        const app = appFactory(a => a.get('/results', withUser({ role: roles.TEACHER, school: 's1' }), getAllResults));
        const res = await request(app).get('/results');
        expect(res.status).toBe(403);
    });
    test('filters by school for principal', async () => {
        Result.countDocuments.mockResolvedValue(1);
        const chain = { populate: () => chain, sort: () => chain, skip: () => chain, limit: () => Promise.resolve([{ school: 's1' }]) };
        Result.find.mockReturnValue(chain);
        const app = appFactory(a => a.get('/results', withUser({ role: roles.PRINCIPAL, school: 's1' }), getAllResults));
        const res = await request(app).get('/results');
        expect(res.status).toBe(200);
        expect(res.body.meta.total).toBe(1);
    });
});
