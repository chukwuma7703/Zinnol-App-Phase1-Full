import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { adjustExamTime } from '../../controllers/examController.js';
import * as ExamModel from '../../models/Exam.js';
import * as ExamInvigilatorModel from '../../models/ExamInvigilator.js';
import { roles } from '../../config/roles.js';

vi.mock('../../models/Exam.js', () => ({ __esModule: true, default: { findByIdAndUpdate: vi.fn() } }));
vi.mock('../../models/ExamInvigilator.js', () => ({ __esModule: true, default: { findOne: vi.fn() } }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn() }; }
function mockNext() { return vi.fn(); }

describe('adjustExamTime authorization branch for teacher invigilator', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    test('teacher must be invigilator', async () => {
        const req = { body: { additionalMinutes: 5 }, user: { role: roles.TEACHER, _id: 't1' }, exam: { _id: 'e1', durationInMinutes: 30 } };
        const res = mockRes();
        const next = mockNext();

        // Not an invigilator -> expect next called with AppError
        ExamInvigilatorModel.default.findOne.mockResolvedValue(null);

        await adjustExamTime(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(ExamModel.default.findByIdAndUpdate).not.toHaveBeenCalled();
    });
});
