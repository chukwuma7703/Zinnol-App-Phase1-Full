import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAssignment, getAssignmentsForClass, submitAssignment, gradeSubmission } from '../../controllers/assignmentController.js';
import Assignment from '../../models/Assignment.js';
import AssignmentSubmission from '../../models/AssignmentSubmission.js';
import Classroom from '../../models/Classroom.js';
import Subject from '../../models/Subject.js';

// Mock the modules at the top level
vi.mock('../../models/Assignment.js', () => ({
    default: {
        create: vi.fn(),
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn()
    }
}));

vi.mock('../../models/AssignmentSubmission.js', () => ({
    default: {
        create: vi.fn(),
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn()
    }
}));

vi.mock('../../models/Classroom.js', () => ({
    default: {
        findById: vi.fn()
    }
}));

vi.mock('../../models/Subject.js', () => ({
    default: {
        findById: vi.fn()
    }
}));

describe('Assignment Controller', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        vi.clearAllMocks();

        mockReq = {
            body: {},
            params: {},
            user: {
                _id: 'teacher123',
                school: 'school123'
            }
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        mockNext = vi.fn();
    });

    describe('createAssignment', () => {
        it('should create a new assignment successfully', async () => {
            const mockAssignment = {
                _id: 'assignment123',
                title: 'Test Assignment',
                description: 'Test description',
                dueDate: '2025-12-31'
            };

            mockReq.body = {
                classroom: 'class123',
                subject: 'subject123',
                title: 'Test Assignment',
                description: 'Test description',
                dueDate: '2025-12-31'
            };

            // Mock Classroom and Subject lookups
            Classroom.findById.mockResolvedValue({ _id: 'class123', school: 'school123' });
            Subject.findById.mockResolvedValue({ _id: 'subject123', school: 'school123' });

            Assignment.create.mockResolvedValue(mockAssignment);

            await createAssignment(mockReq, mockRes, mockNext);

            expect(Assignment.create).toHaveBeenCalledWith({
                school: 'school123',
                classroom: 'class123',
                subject: 'subject123',
                teacher: 'teacher123',
                title: 'Test Assignment',
                description: 'Test description',
                dueDate: '2025-12-31',
                status: 'published'
            });

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Assignment created successfully.',
                data: mockAssignment
            });
        });
    });

    describe('getAssignmentsForClass', () => {
        it('should retrieve assignments for a classroom', async () => {
            const mockAssignments = [
                {
                    _id: 'assignment1',
                    title: 'Assignment 1',
                    teacher: { name: 'Teacher One' }
                },
                {
                    _id: 'assignment2',
                    title: 'Assignment 2',
                    teacher: { name: 'Teacher Two' }
                }
            ];

            mockReq.params = { classroomId: 'class123' };

            // Mock classroom lookup
            Classroom.findById.mockResolvedValue({ _id: 'class123', school: 'school123' });

            Assignment.find.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue(mockAssignments)
            });

            await getAssignmentsForClass(mockReq, mockRes, mockNext);

            expect(Assignment.find).toHaveBeenCalledWith({
                classroom: 'class123',
                status: 'published'
            });

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Assignments retrieved successfully.',
                data: mockAssignments
            });
        });
    });

    describe('submitAssignment', () => {
        beforeEach(() => {
            mockReq.user.studentProfile = 'student123';
        });

        it('should submit assignment successfully when on time', async () => {
            const mockAssignment = {
                _id: 'assignment123',
                dueDate: '2025-12-31'
            };

            const mockSubmission = {
                _id: 'submission123',
                assignment: 'assignment123',
                student: 'student123',
                textSubmission: 'My submission',
                status: 'submitted'
            };

            mockReq.params = { id: 'assignment123' };
            mockReq.body = { textSubmission: 'My submission' };

            Assignment.findById.mockResolvedValue(mockAssignment);
            AssignmentSubmission.findOne.mockResolvedValue(null);
            AssignmentSubmission.create.mockResolvedValue(mockSubmission);

            // Mock Date to be before due date
            const originalDate = global.Date;
            global.Date = vi.fn(() => new originalDate('2025-12-30'));

            await submitAssignment(mockReq, mockRes, mockNext);

            expect(Assignment.findById).toHaveBeenCalledWith('assignment123');
            expect(AssignmentSubmission.findOne).toHaveBeenCalledWith({
                assignment: 'assignment123',
                student: 'student123'
            });
            expect(AssignmentSubmission.create).toHaveBeenCalledWith({
                assignment: 'assignment123',
                student: 'student123',
                textSubmission: 'My submission',
                status: 'submitted'
            });

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Assignment submitted successfully.',
                data: mockSubmission
            });

            global.Date = originalDate;
        });
    });

    describe('gradeSubmission', () => {
        it('should grade submission successfully', async () => {
            const mockSubmission = {
                _id: 'submission123',
                grade: 85,
                feedback: 'Good work!',
                status: 'graded',
                gradedBy: 'teacher123'
            };

            mockReq.params = { submissionId: 'submission123' };
            mockReq.body = { grade: 85, feedback: 'Good work!' };

            AssignmentSubmission.findByIdAndUpdate.mockResolvedValue(mockSubmission);

            await gradeSubmission(mockReq, mockRes, mockNext);

            expect(AssignmentSubmission.findByIdAndUpdate).toHaveBeenCalledWith('submission123', {
                grade: 85,
                feedback: 'Good work!',
                status: 'graded',
                gradedBy: 'teacher123'
            }, { new: true });

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Submission graded successfully.',
                data: mockSubmission
            });
        });
    });
});
