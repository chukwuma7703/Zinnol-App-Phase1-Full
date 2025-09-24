import { vi } from 'vitest';
import { uploadVoiceNote, deleteVoiceNote } from '../../../controllers/resultController.js';
import Result from '../../../models/Result.js';
import { roles } from '../../../config/roles.js';
import path from 'path';

vi.mock('../../../models/Result.js', () => ({
    __esModule: true,
    default: {
        findById: vi.fn(),
    }
}));

const mkReq = (overrides = {}) => ({ params: {}, user: { _id: 'u1', role: roles.TEACHER, school: 'sch1' }, file: null, ...overrides });
const mkRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const mkNext = () => vi.fn();

// Helper to build a mock result doc
const makeResult = (over = {}) => ({
    _id: 'r1',
    school: 'sch1',
    status: 'pending',
    save: vi.fn(async function () { return this; }),
    ...over
});

describe('result voice note controller (unit)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('uploadVoiceNote rejects missing file', async () => {
        const req = mkReq({ params: { resultId: 'r1' } });
        const res = mkRes();
        const next = mkNext();
        await uploadVoiceNote(req, res, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(400);
    });

    test('uploadVoiceNote 404 when result missing', async () => {
        Result.findById.mockResolvedValue(null);
        const req = mkReq({ params: { resultId: 'r404' }, file: { filename: 'note.mp3' } });
        const res = mkRes();
        const next = mkNext();
        await uploadVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('uploadVoiceNote forbids cross-school access', async () => {
        Result.findById.mockResolvedValue(makeResult({ school: 'other' }));
        const req = mkReq({ params: { resultId: 'r1' }, file: { filename: 'note.mp3' } });
        const res = mkRes();
        const next = mkNext();
        await uploadVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    test('uploadVoiceNote prevents overwrite teacher', async () => {
        Result.findById.mockResolvedValue(makeResult({ teacherVoiceNoteUrl: '/uploads/voice-notes/existing.mp3' }));
        const req = mkReq({ params: { resultId: 'r1' }, file: { filename: 'note2.mp3' } });
        const res = mkRes();
        const next = mkNext();
        await uploadVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(409);
    });

    test('uploadVoiceNote success teacher path', async () => {
        const doc = makeResult();
        Result.findById.mockResolvedValue(doc);
        const req = mkReq({ params: { resultId: 'r1' }, file: { filename: 'fresh.mp3' } });
        const res = mkRes();
        await uploadVoiceNote(req, res, mkNext());
        expect(doc.teacherVoiceNoteUrl).toBe('/uploads/voice-notes/fresh.mp3');
        expect(res.json).toHaveBeenCalled();
    });

    test('deleteVoiceNote 404 when result missing', async () => {
        Result.findById.mockResolvedValue(null);
        const req = mkReq({ params: { resultId: 'r404' } });
        const res = mkRes();
        const next = mkNext();
        await deleteVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('deleteVoiceNote forbidden cross-school', async () => {
        Result.findById.mockResolvedValue(makeResult({ school: 'other' }));
        const req = mkReq({ params: { resultId: 'r1' } });
        const res = mkRes();
        const next = mkNext();
        await deleteVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    test('deleteVoiceNote rejects non-pending', async () => {
        Result.findById.mockResolvedValue(makeResult({ status: 'approved', teacherVoiceNoteUrl: '/uploads/voice-notes/x.mp3' }));
        const req = mkReq({ params: { resultId: 'r1' } });
        const res = mkRes();
        const next = mkNext();
        await deleteVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    test('deleteVoiceNote 404 when no note for role', async () => {
        Result.findById.mockResolvedValue(makeResult({ teacherVoiceNoteUrl: undefined }));
        const req = mkReq({ params: { resultId: 'r1' } });
        const res = mkRes();
        const next = mkNext();
        await deleteVoiceNote(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('deleteVoiceNote success teacher note', async () => {
        const doc = makeResult({ teacherVoiceNoteUrl: '/uploads/voice-notes/t1.mp3' });
        Result.findById.mockResolvedValue(doc);
        const req = mkReq({ params: { resultId: 'r1' } });
        const res = mkRes();
        await deleteVoiceNote(req, res, mkNext());
        expect(doc.teacherVoiceNoteUrl).toBeUndefined();
        expect(res.json).toHaveBeenCalled();
    });
});
