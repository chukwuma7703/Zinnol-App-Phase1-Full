import { addStudentToSchool, updateStudentInSchool, removeStudentFromSchool } from '../../../controllers/schoolController.js';
import User from '../../../models/userModel.js';
import School from '../../../models/School.js';
import { roles } from '../../../config/roles.js';
import { vi } from 'vitest';

vi.mock('../../../models/userModel.js', () => ({ __esModule: true, default: { findOne: vi.fn(), create: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('../../../models/School.js', () => ({ __esModule: true, default: { findById: vi.fn() } }));

const mkRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const mkNext = () => vi.fn();

const mkSchool = (over = {}) => ({ _id: 'sch1', students: [], save: vi.fn(async function () { return this; }), ...over });
const mkStudent = (over = {}) => ({ _id: 'stu1', role: roles.STUDENT, school: 'sch1', save: vi.fn(async function () { return this; }), deleteOne: vi.fn(async () => { }), toObject() { return { ...this }; }, ...over });

describe('school student controller (unit)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    test('addStudentToSchool success', async () => {
        const school = mkSchool();
        const studentDoc = mkStudent({ _id: 'newStu', role: roles.STUDENT });
        User.findOne.mockResolvedValue(null);
        User.create.mockResolvedValue(studentDoc);
        const req = { body: { name: 'New', email: 'a@b.com', password: 'p', className: 'JSS 2' }, school };
        const res = mkRes();
        await addStudentToSchool(req, res, mkNext());
        expect(res.status).toHaveBeenCalledWith(201);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.data.student._id).toBe('newStu');
        expect(payload.message).toMatch(/Student created/i);
    });

    test('addStudentToSchool duplicate email', async () => {
        const school = mkSchool();
        User.findOne.mockResolvedValue({ _id: 'existing' });
        const req = { body: { name: 'Dup', email: 'dup@test.com', password: 'p' }, school };
        const res = mkRes();
        const next = mkNext();
        await addStudentToSchool(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    test('addStudentToSchool missing name -> 400', async () => {
        const school = mkSchool();
        User.findOne.mockResolvedValue(null);
        const req = { body: { email: 'x@y.com', password: 'secret', className: 'JSS 1' }, school };
        const res = mkRes();
        const next = mkNext();
        await addStudentToSchool(req, res, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(400);
        expect(User.create).not.toHaveBeenCalled();
    });

    test('addStudentToSchool missing email -> 400', async () => {
        const school = mkSchool();
        User.findOne.mockResolvedValue(null);
        const req = { body: { name: 'NoEmail', password: 'secret', className: 'JSS 1' }, school };
        const res = mkRes();
        const next = mkNext();
        await addStudentToSchool(req, res, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(400);
        expect(User.create).not.toHaveBeenCalled();
    });

    test('addStudentToSchool missing password -> 400', async () => {
        const school = mkSchool();
        User.findOne.mockResolvedValue(null);
        const req = { body: { name: 'NoPass', email: 'n@p.com', className: 'JSS 1' }, school };
        const res = mkRes();
        const next = mkNext();
        await addStudentToSchool(req, res, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(400);
        expect(User.create).not.toHaveBeenCalled();
    });

    test('updateStudentInSchool success', async () => {
        const school = mkSchool();
        const student = mkStudent({ name: 'Old', className: 'JSS 1' });
        const req = { params: { studentId: 'stu1' }, body: { name: 'Updated', className: 'JSS 3' }, school, student };
        const res = mkRes();
        await updateStudentInSchool(req, res, mkNext());
        expect(student.name).toBe('Updated');
        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.data.student.name).toBe('Updated');
        expect(payload.message).toMatch(/Student updated/i);
    });

    test('updateStudentInSchool not found', async () => {
        const school = mkSchool();
        User.findById = vi.fn().mockResolvedValue(null);
        const req = { params: { studentId: 'missing' }, body: { name: 'Any' }, school };
        const res = mkRes();
        const next = mkNext();
        await updateStudentInSchool(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('updateStudentInSchool school mismatch', async () => {
        const school = mkSchool();
        const student = mkStudent({ school: 'different' });
        const req = { params: { studentId: 'stu1' }, body: { name: 'X' }, school, student };
        const res = mkRes();
        const next = mkNext();
        await updateStudentInSchool(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('updateStudentInSchool missing school object (500 defensive)', async () => {
        const req = { params: { studentId: 'stu1' }, body: { name: 'Any' } }; // no school
        const res = mkRes();
        const next = mkNext();
        await updateStudentInSchool(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(500);
    });

    test('removeStudentFromSchool success', async () => {
        const student = mkStudent();
        const school = mkSchool({ students: ['stu1', 'other'] });
        const req = { params: { studentId: 'stu1' }, school, student };
        const res = mkRes();
        await removeStudentFromSchool(req, res, mkNext());
        expect(school.students).not.toContain('stu1');
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.message).toMatch(/removed successfully/i);
    });

    test('removeStudentFromSchool not found', async () => {
        const school = mkSchool({ students: [] });
        User.findOne = vi.fn().mockResolvedValue(null);
        const req = { params: { studentId: 'missing' }, school };
        const res = mkRes();
        const next = mkNext();
        await removeStudentFromSchool(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    test('removeStudentFromSchool missing school object (500 defensive)', async () => {
        const req = { params: { studentId: 'stu1' } }; // no school
        const res = mkRes();
        const next = mkNext();
        await removeStudentFromSchool(req, res, next);
        expect(next.mock.calls[0][0].statusCode).toBe(500);
    });
});
