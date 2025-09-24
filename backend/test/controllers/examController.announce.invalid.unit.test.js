import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sendExamAnnouncement } from '../../controllers/examController.js';

function mockRes() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
function mockNext() { return vi.fn(); }

describe('sendExamAnnouncement invalid message', () => {
    it('rejects empty/blank message with 400', async () => {
        const req = { user: { name: 'T' }, exam: { _id: 'ex-1' }, body: { message: '   ' } };
        const res = mockRes();
        const next = mockNext();

        await sendExamAnnouncement(req, res, next);
        expect(next).toHaveBeenCalled();
        const err = next.mock.calls[0][0];
        expect(err.statusCode || err.status).toBe(400);
    });
});
