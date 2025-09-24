import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/Classroom.js', () => ({ __esModule: true, default: { create: vi.fn(), countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() } }));
vi.mock('../../../models/userModel.js', () => ({ __esModule: true, default: { findOne: vi.fn() } }));
vi.mock('../../../utils/ApiResponse.js', () => ({ __esModule: true, ok: (res, data, message = 'OK') => res.status(200).json({ success: true, message, data }), created: (res, data, message = 'Created') => res.status(201).json({ success: true, message, data }) }));
vi.mock('../../../config/roles.js', () => ({ __esModule: true, roles: { TEACHER: 'TEACHER' } }));
vi.mock('express-async-handler', () => ({ __esModule: true, default: (fn) => fn }));

import Classroom from '../../../models/Classroom.js';
import User from '../../../models/userModel.js';
import { createClassroom, getClassrooms, updateClassroom } from '../../../controllers/classController.js';

const makeRes = () => { const res = {}; res.status = (c) => { res.statusCode = c; return res; }; res.json = (b) => { res.body = b; return res; }; return res; };

describe('classController ApiResponse migration', () => {
    beforeEach(() => vi.clearAllMocks());

    it('createClassroom returns created ApiResponse shape', async () => {
        const teacherId = 't1';
        User.findOne.mockResolvedValue({ _id: teacherId });
        Classroom.create.mockResolvedValue({ _id: 'c1', label: 'JSS1 A' });
        const req = { body: { name: 'JSS1 A', level: 'jss1', teacherId }, user: { school: 's1' } };
        const res = makeRes(); const next = vi.fn();
        await createClassroom(req, res, next);
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data._id).toBe('c1');
        expect(res.body.message).toBe('Classroom created');
    });

    it('getClassrooms returns list with wrapper', async () => {
        Classroom.countDocuments.mockResolvedValue(1);
        const chain = { populate: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), sort: vi.fn().mockResolvedValue([{ _id: 'c1' }]) };
        Classroom.find.mockReturnValue(chain);
        const req = { query: {}, user: { school: 's1' } };
        const res = makeRes(); const next = vi.fn();
        await getClassrooms(req, res, next);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.classes.length).toBe(1);
        expect(res.body.message).toBe('Classroom list');
    });

    it('updateClassroom returns updated classroom wrapped', async () => {
        const populated = { _id: 'c1', label: 'New', teacher: 't1' };
        const save = vi.fn().mockResolvedValue({ _id: 'c1', label: 'New', populate: vi.fn().mockResolvedValue(populated) });
        Classroom.findOne.mockResolvedValue({ _id: 'c1', label: 'Old', stage: 'jss', level: 1, save });
        const req = { params: { id: 'c1' }, body: { name: 'New' }, user: { school: 's1' } };
        const res = makeRes(); const next = vi.fn();
        await updateClassroom(req, res, next);
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Classroom updated');
        expect(res.body.data._id).toBe('c1');
    });
});
