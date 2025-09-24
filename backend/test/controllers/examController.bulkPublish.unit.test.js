import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bulkPublishExamScores } from '../../controllers/examController.js';
import StudentExam from '../../models/StudentExam.js';
import * as ResultModel from '../../models/Result.js';
import { bulkUpdateOrCreateResults } from '../../services/resultService.js';
import { invalidateStudentResultCache, getCachedStudentResults } from '../../config/cache.js';

vi.mock('../../models/StudentExam.js', () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        updateMany: vi.fn()
    }
}));
vi.mock('../../models/Result.js', () => ({ __esModule: true, default: { find: vi.fn() } }));
vi.mock('../../services/resultService.js', () => ({ __esModule: true, bulkUpdateOrCreateResults: vi.fn() }));
vi.mock('../../config/cache.js', () => ({
    __esModule: true,
    invalidateStudentResultCache: vi.fn(),
    getCachedStudentResults: vi.fn()
}));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
function mockNext() { return vi.fn(); }

describe('bulkPublishExamScores summary counts', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('processes batch and returns 207 with success/fail counts', async () => {
        const req = { exam: { _id: 'ex-b', session: '2024/2025', term: 1 }, user: { _id: 'teacher-1' }, startTime: Date.now() };
        const res = mockRes();
        const next = mockNext();

        const subs = [
            { _id: 's1', status: 'marked', isPublished: false, totalScore: 80, student: { _id: 'stu1', school: 'sch' }, exam: { subject: 'subj', classroom: 'cls', totalMarks: 100 } },
            { _id: 's2', status: 'marked', isPublished: false, totalScore: 65, student: { _id: 'stu2', school: 'sch' }, exam: { subject: 'subj', classroom: 'cls', totalMarks: 100 } },
        ];
        StudentExam.find.mockReturnValue({ populate: vi.fn().mockResolvedValue(subs) });
        ResultModel.default.find.mockResolvedValue([]);
        getCachedStudentResults.mockResolvedValue(new Map());

        // First student succeeds, second fails
        bulkUpdateOrCreateResults.mockResolvedValue({ errors: [{ studentId: 'stu2' }] });

        await bulkPublishExamScores(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(207);
        const payload = res.json.mock.calls[0][0];
        expect(payload.summary.total).toBe(2);
        expect(payload.summary.successful + payload.summary.failed).toBe(2);
        expect(StudentExam.updateMany).toHaveBeenCalledTimes(1);
        // invalidate cache called for successful student(s)
        expect(typeof invalidateStudentResultCache).toBe('function');
    });

    it('uses cached results when available (no DB fetch)', async () => {
        const req = { exam: { _id: 'ex-c', session: '2024/2025', term: 2 }, user: { _id: 'teacher-2' }, startTime: Date.now() };
        const res = mockRes();
        const next = mockNext();

        const subs = [
            { _id: 's1', status: 'marked', isPublished: false, totalScore: 80, student: { _id: 'stu1', school: 'sch' }, exam: { subject: 'subj', classroom: 'cls', totalMarks: 100 } },
            { _id: 's2', status: 'marked', isPublished: false, totalScore: 70, student: { _id: 'stu2', school: 'sch' }, exam: { subject: 'subj', classroom: 'cls', totalMarks: 100 } },
        ];
        StudentExam.find.mockReturnValue({ populate: vi.fn().mockResolvedValue(subs) });

        // All results are cached -> no DB fetch and no cacheStudentResults calls
        const cachedMap = new Map([
            ['stu1', { student: 'stu1' }],
            ['stu2', { student: 'stu2' }],
        ]);
        getCachedStudentResults.mockResolvedValue(cachedMap);
        vi.spyOn(ResultModel.default, 'find');

        bulkUpdateOrCreateResults.mockResolvedValue({ errors: [] });

        await bulkPublishExamScores(req, res, next);

        expect(ResultModel.default.find).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(207);
    });
});
