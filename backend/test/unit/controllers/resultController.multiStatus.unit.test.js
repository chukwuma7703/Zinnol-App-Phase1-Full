import express from 'express';
import request from 'supertest';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { vi } from 'vitest';
import { submitResultsFromOCR, generateAnnualResultsForClassroom, bulkExportResults } from '../../../controllers/resultController.js';
import { roles } from '../../../middleware/authMiddleware.js';

// Mocks
vi.mock('tesseract.js', () => ({ createWorker: vi.fn(async () => ({ loadLanguage: vi.fn(), initialize: vi.fn(), recognize: vi.fn(async () => ({ data: { text: 'ZNL-001 John 10 20' } })), terminate: vi.fn() })) }));
vi.mock('sharp', () => ({
    default: vi.fn(() => ({ grayscale: () => ({ sharpen: () => ({ toBuffer: async () => Buffer.from('img') }) }) }))
}));

vi.mock('../../../models/Student.js', () => ({ __esModule: true, default: { findOne: vi.fn(async () => ({ _id: 'stu1', school: 'sch1' })) } }));
vi.mock('../../../models/Result.js', () => ({ __esModule: true, default: { findOneAndUpdate: vi.fn(async () => ({ _id: 'r1' })), find: vi.fn(() => ({ lean: () => [] })), } }));
vi.mock('../../../utils/csvResultUtils.js', () => ({ __esModule: true, convertToCsv: vi.fn(() => 'student,classroom'), parseCsvFile: vi.fn() }));

vi.mock('../../../queues/resultQueue.js', () => ({ annualResultQueue: { add: vi.fn(async () => ({})) } }));

const upload = multer({ storage: multer.memoryStorage() });

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

describe('resultController multi-status endpoints', () => {
    test('submitResultsFromOCR 207 multi-status with summary meta', async () => {
        const app = appFactory(a => a.post('/ocr', withUser({ _id: 't1', school: 'sch1', role: roles.TEACHER }), upload.single('file'), submitResultsFromOCR));
        const tmp = path.join(process.cwd(), 'temp-img.png');
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

    test('submitResultsFromOCR validation error missing fields', async () => {
        const app = appFactory(a => a.post('/ocr', withUser({ _id: 't1', school: 'sch1', role: roles.TEACHER }), upload.single('file'), submitResultsFromOCR));
        const tmp = path.join(process.cwd(), 'temp-img2.png');
        fs.writeFileSync(tmp, 'img');
        const res = await request(app)
            .post('/ocr')
            .field('classroomId', 'c1') // missing others
            .attach('file', tmp);
        fs.unlinkSync(tmp);
        expect(res.status).toBe(400);
    });

    test('generateAnnualResultsForClassroom schedules 202', async () => {
        const app = appFactory(a => a.post('/annual/:classroomId/:session', withUser({ _id: 'adm', school: 'sch1', role: roles.PRINCIPAL }), generateAnnualResultsForClassroom));
        const res = await request(app).post('/annual/c1/2024-2025');
        expect(res.status).toBe(202);
        expect(res.body.message).toMatch(/scheduled/);
    });

    test('bulkExportResults returns csv headers', async () => {
        const app = appFactory(a => a.get('/export', withUser({ _id: 'adm', school: 'sch1', role: roles.PRINCIPAL }), bulkExportResults));
        const res = await request(app).get('/export');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
    });
});
