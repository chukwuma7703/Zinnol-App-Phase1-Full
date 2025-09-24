import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { endExam } from '../../controllers/examController.js';
import * as ExamInvigilatorModel from '../../models/ExamInvigilator.js';
import { roles } from '../../config/roles.js';

vi.mock('../../models/ExamInvigilator.js', () => ({ __esModule: true, default: { findOne: vi.fn() } }));

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn() }; }

function mockNext() { return vi.fn(); }

describe('endExam authorization branches', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    test('teacher must be assigned by allowed role', async () => {
        const req = { user: { role: roles.TEACHER, _id: 't1' }, exam: { _id: 'e3' } };
        const res = mockRes();
        const next = mockNext();

        // Assigned by non-allowed role -> expect AuthorizationError via next()
        ExamInvigilatorModel.default.findOne.mockResolvedValue({ assignedBy: { role: roles.TEACHER } });

        await endExam(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});
