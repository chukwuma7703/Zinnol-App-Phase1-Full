import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pauseExam, adjustExamTime, endExam, sendExamAnnouncement } from '../../controllers/examController.js';
// We'll stub the specific static methods we call on these models
import * as StudentExamModel from '../../models/StudentExam.js';
import * as ExamModel from '../../models/Exam.js';
import * as ExamInvigilatorModel from '../../models/ExamInvigilator.js';
import { roles } from '../../config/roles.js';
import { getIO } from '../../config/socket.js';

vi.mock('../../models/StudentExam.js', () => ({ __esModule: true, default: { find: vi.fn(), findById: vi.fn(), updateMany: vi.fn() } }));
vi.mock('../../models/Exam.js', () => ({ __esModule: true, default: { findByIdAndUpdate: vi.fn() } }));
vi.mock('../../models/ExamInvigilator.js', () => ({ __esModule: true, default: { findOne: vi.fn() } }));

// socket is mapped to test/mocks/socketMock.js via jest config

function mockRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function mockNext() {
    return vi.fn();
}

describe('examController unit (socket + light DB flows)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('pauseExam emits socket events and updates submission', async () => {
        const req = { params: { submissionId: 'sub1' }, user: { role: roles.GLOBAL_SUPER_ADMIN, school: 's1' } };
        const res = mockRes();
        const next = mockNext();

        // Mock the database call with populated exam
        const mockSubmission = {
            _id: 'sub1',
            status: 'in-progress',
            endTime: new Date(Date.now() + 3600000), // 1 hour from now
            exam: { _id: 'exam1', school: 's1' },
            student: 'student1',
            pauseCount: 0,
            save: vi.fn().mockResolvedValue({})
        };

        // Mock the chain: findById().populate()
        const mockQuery = {
            populate: vi.fn().mockResolvedValue(mockSubmission)
        };
        StudentExamModel.default.findById.mockReturnValue(mockQuery);

        await pauseExam(req, res, next);

        expect(StudentExamModel.default.findById).toHaveBeenCalledWith('sub1');
        expect(mockQuery.populate).toHaveBeenCalledWith('exam');
        expect(mockSubmission.save).toHaveBeenCalled();
        expect(mockSubmission.status).toBe('paused');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: 'Exam paused successfully.',
            data: mockSubmission
        });
    });

    it('endExam updates submission status and emits events', async () => {
        const req = {
            exam: { _id: 'exam1', scheduledEndAt: null },
            user: { role: roles.GLOBAL_SUPER_ADMIN, school: 's1' }
        };
        const res = mockRes();
        const next = mockNext();

        // Mock the database calls
        const mockSubmissions = [
            { _id: 'sub1', status: 'in-progress' },
            { _id: 'sub2', status: 'in-progress' }
        ];
        StudentExamModel.default.find.mockResolvedValue(mockSubmissions);
        StudentExamModel.default.updateMany.mockResolvedValue({ acknowledged: true });

        await endExam(req, res, next);

        expect(StudentExamModel.default.find).toHaveBeenCalledWith({
            exam: 'exam1',
            status: 'in-progress'
        });
        expect(StudentExamModel.default.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['sub1', 'sub2'] } },
            {
                $set: {
                    status: 'submitted',
                    endTime: expect.any(Date)
                }
            }
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: 'Exam ended successfully. 2 in-progress submissions were force-submitted.',
            data: {
                examId: 'exam1',
                forceSubmittedCount: 2,
                endedAt: expect.any(Date)
            }
        });
    });

    it('sendExamAnnouncement emits socket event', async () => {
        const req = {
            exam: { _id: 'exam1' },
            body: { message: 'Test announcement' },
            user: { role: roles.GLOBAL_SUPER_ADMIN, school: 's1', name: 'Admin' }
        };
        const res = mockRes();
        const next = mockNext();

        await sendExamAnnouncement(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'Announcement sent successfully.' });
    });
});