import { vi } from 'vitest';
import { getScheme, updateLessonStatus, addLessonNote, reviewLesson, addLessonFeedback } from '../../../controllers/schemeController.js';
import SchemeOfWork, { Lesson } from '../../../models/SchemeOfWork.js';
import { roles } from '../../../config/roles.js';

vi.mock('../../../models/SchemeOfWork.js', () => ({
    __esModule: true,
    default: { findById: vi.fn(() => ({ lean: () => ({ _id: 'scheme1', school: 'school1', lessonsPlanned: 10, lessonsCompleted: 5 }) })) },
    Lesson: { find: vi.fn(), findById: vi.fn(), insertMany: vi.fn() }
}));

const okUser = { _id: 'u1', role: roles.TEACHER, school: 'school1' };
const principal = { _id: 'p1', role: roles.PRINCIPAL, school: 'school1' };
const parent = { _id: 'pa1', role: roles.PARENT, school: 'school1' };
const otherSchoolUser = { _id: 'u2', role: roles.TEACHER, school: 'schoolX' };

const mkReqRes = ({ params = {}, body = {}, user = okUser, query = {} } = {}) => {
    const req = { params, body, user, query };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    return { req, res, next };
};

const expectOk = (resObj, msg) => {
    expect(resObj.status).toHaveBeenCalled();
    const code = resObj.status.mock.calls[0][0];
    expect([200, 201]).toContain(code);
    const body = resObj.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.message).toBe(msg);
    Object.keys(body).forEach(k => expect(['success', 'message', 'data', 'meta']).toContain(k));
    return body;
};
const expectErr = (next) => { expect(next).toHaveBeenCalled(); return next.mock.calls[0][0]; };

const flush = () => new Promise(r => process.nextTick(r));

describe('schemeController remaining endpoints', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('getScheme', () => {
        it('success returns scheme, lessons, progress', async () => {
            const lessons = [{ _id: 'l1', status: 'planned' }];
            Lesson.find.mockReturnValueOnce({ lean: () => lessons });
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439011' } });
            await getScheme(req, res, next); await flush();
            expect(next).not.toHaveBeenCalled();
            const body = res.json.mock.calls[0][0];
            expect(body.data.scheme._id).toBe('scheme1');
            expect(body.data.lessons).toEqual(lessons);
            expect(body.data.progress).toBe(50);
        });
        it('not found scheme triggers error', async () => {
            SchemeOfWork.findById.mockReturnValueOnce({ lean: () => null });
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439011' } });
            await getScheme(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/SchemeOfWork/);
        });
        it('cross school forbidden', async () => {
            SchemeOfWork.findById.mockReturnValueOnce({ lean: () => ({ _id: 'scheme1', school: 'school2', lessonsPlanned: 10, lessonsCompleted: 2 }) });
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439011' } });
            await getScheme(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/access/i);
        });
    });

    describe('updateLessonStatus', () => {
        it('success updates status', async () => {
            Lesson.findById.mockResolvedValueOnce({ _id: 'l1', status: 'planned', save: vi.fn(), scheme: 'scheme1' });
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439012' }, body: { status: 'done' } });
            await updateLessonStatus(req, res, next); await flush();
            expect(next).not.toHaveBeenCalled();
            const body = res.json.mock.calls[0][0];
            expect(body.data.lesson.status).toBe('done');
        });
        it('invalid status validation error', async () => {
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439012' }, body: { status: 'weird' } });
            await updateLessonStatus(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/validation/i);
        });
        it('not found lesson', async () => {
            Lesson.findById.mockResolvedValueOnce(null);
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439012' }, body: { status: 'planned' } });
            await updateLessonStatus(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/Lesson/);
        });
        it('forbidden role', async () => {
            Lesson.findById.mockResolvedValueOnce({ _id: 'l1', status: 'planned', save: vi.fn() });
            const { req, res, next } = mkReqRes({ user: { _id: 'x', role: roles.STUDENT, school: 'school1' }, params: { id: '507f1f77bcf86cd799439012' }, body: { status: 'planned' } });
            await updateLessonStatus(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/not allowed/i);
        });
    });

    describe('addLessonNote', () => {
        it('success adds note', async () => {
            Lesson.findById.mockResolvedValueOnce({ _id: 'l1', scheme: 'scheme1', notes: [], save: vi.fn() });
            SchemeOfWork.findById.mockReturnValueOnce({ select: () => ({ school: 'school1', createdBy: 'u1' }) });
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439013' }, body: { content: 'Note', resources: [] } });
            await addLessonNote(req, res, next); await flush();
            expect(res.status).toHaveBeenCalledWith(201);
            const body = res.json.mock.calls[0][0];
            expect(body.data.lessonId).toBe('l1');
            expect(body.data.notes.length).toBe(1);
        });
        it('missing content validation error', async () => {
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439013' }, body: { resources: [] } });
            await addLessonNote(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/validation/i);
        });
        it('not found lesson', async () => {
            Lesson.findById.mockResolvedValueOnce(null);
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439013' }, body: { content: 'X' } });
            await addLessonNote(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/Lesson/);
        });
        it('cross-school access denied', async () => {
            Lesson.findById.mockResolvedValueOnce({ _id: 'l1', scheme: 'scheme1', notes: [], save: vi.fn() });
            SchemeOfWork.findById.mockReturnValueOnce({ select: () => ({ school: 'school2', createdBy: 'u1' }) });
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439013' }, body: { content: 'N' } });
            await addLessonNote(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/cross-school/i);
        });
    });

    describe('reviewLesson', () => {
        it('success adds review', async () => {
            Lesson.findById.mockResolvedValueOnce({ _id: 'l1', reviews: [], save: vi.fn() });
            const { req, res, next } = mkReqRes({ user: principal, params: { id: '507f1f77bcf86cd799439014' }, body: { status: 'approved', comments: 'Looks good' } });
            await reviewLesson(req, res, next); await flush();
            const body = res.json.mock.calls[0][0];
            expect(body.data.lessonId).toBe('l1');
            expect(body.data.reviews[0].status).toBe('approved');
        });
        it('invalid status', async () => {
            const { req, res, next } = mkReqRes({ user: principal, params: { id: '507f1f77bcf86cd799439014' }, body: { status: 'meh' } });
            await reviewLesson(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/validation/i);
        });
        it('not allowed role', async () => {
            const { req, res, next } = mkReqRes({ params: { id: '507f1f77bcf86cd799439014' }, body: { status: 'approved' } });
            await reviewLesson(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/not allowed/i);
        });
    });

    describe('addLessonFeedback', () => {
        it('success records feedback', async () => {
            Lesson.findById.mockResolvedValueOnce({ _id: 'l1', feedback: [], save: vi.fn() });
            const { req, res, next } = mkReqRes({ user: parent, params: { id: '507f1f77bcf86cd799439015' }, body: { confirmation: true, comment: 'Ok' } });
            await addLessonFeedback(req, res, next); await flush();
            expect(res.status).toHaveBeenCalledWith(201);
            const body = res.json.mock.calls[0][0];
            expect(body.data.feedback[0].confirmation).toBe(true);
        });
        it('invalid confirmation', async () => {
            const { req, res, next } = mkReqRes({ user: parent, params: { id: '507f1f77bcf86cd799439015' }, body: { confirmation: 'yes' } });
            await addLessonFeedback(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/validation/i);
        });
        it('not allowed role', async () => {
            const { req, res, next } = mkReqRes({ user: okUser, params: { id: '507f1f77bcf86cd799439015' }, body: { confirmation: true } });
            await addLessonFeedback(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/not allowed/i);
        });
        it('lesson not found', async () => {
            Lesson.findById.mockResolvedValueOnce(null);
            const { req, res, next } = mkReqRes({ user: parent, params: { id: '507f1f77bcf86cd799439015' }, body: { confirmation: true } });
            await addLessonFeedback(req, res, next); await flush();
            const err = expectErr(next);
            expect(err.message).toMatch(/Lesson/);
        });
    });
});
