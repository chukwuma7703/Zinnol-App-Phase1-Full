import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the modules at the top level (ESM-friendly)
vi.mock('../../../models/Assignment.js', () => {
    const mockModule = {
        create: vi.fn(),
        find: vi.fn(() => ({
            populate: vi.fn(() => ({ sort: vi.fn() }))
        })),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn()
    };
    return { __esModule: true, default: mockModule };
});

vi.mock('../../../models/AssignmentSubmission.js', () => {
    const mockModule = {
        create: vi.fn(),
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn()
    };
    return { __esModule: true, default: mockModule };
});

vi.mock('../../../models/Classroom.js', () => {
    const mockModule = {
        findById: vi.fn()
    };
    return { __esModule: true, default: mockModule };
});

vi.mock('../../../models/Subject.js', () => {
    const mockModule = {
        findById: vi.fn()
    };
    return { __esModule: true, default: mockModule };
});

// Mock ApiResponse utilities
vi.mock('../../../utils/ApiResponse.js', () => ({
    __esModule: true,
    ok: vi.fn((res, data, message) => {
        res.status(200).json({ success: true, message, data });
    }),
    created: vi.fn((res, data, message) => {
        res.status(201).json({ success: true, message, data });
    })
}));

// Mock AppError
vi.mock('../../../utils/AppError.js', () => ({
    __esModule: true,
    default: class AppError extends Error {
        constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    }
}));

// Import mocked modules for use in tests
import Assignment from '../../../models/Assignment.js';
import AssignmentSubmission from '../../../models/AssignmentSubmission.js';
import Classroom from '../../../models/Classroom.js';
import Subject from '../../../models/Subject.js';
import AppError from '../../../utils/AppError.js';

describe('Assignment Controller (Improved)', () => {
    let mockReq, mockRes, mockNext;
    let createAssignment, getAssignmentsForClass, submitAssignment, gradeSubmission;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Import controller functions after mocks are set up
        const controller = await import('../../../controllers/assignmentController.js');
        createAssignment = controller.createAssignment;
        getAssignmentsForClass = controller.getAssignmentsForClass;
        submitAssignment = controller.submitAssignment;
        gradeSubmission = controller.gradeSubmission;

        mockReq = {
            body: {},
            params: {},
            user: {
                _id: 'teacher123',
                school: 'school123',
                role: 'teacher'
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
                dueDate: '2025-12-31T00:00:00.000Z',
                school: 'school123',
                classroom: 'class123',
                subject: 'subject123',
                teacher: 'teacher123',
                status: 'published'
            };

            mockReq.body = {
                classroom: 'class123',
                subject: 'subject123',
                title: 'Test Assignment',
                description: 'Test description',
                dueDate: '2025-12-31T00:00:00.000Z'
            };

            // Mock classroom and subject validation
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
                dueDate: '2025-12-31T00:00:00.000Z',
                status: 'published'
            });

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Assignment created successfully.',
                data: mockAssignment
            });
        });

        it('should handle database errors', async () => {
            mockReq.body = {
                classroom: 'class123',
                subject: 'subject123',
                title: 'Test Assignment',
                description: 'Test description',
                dueDate: '2025-12-31T00:00:00.000Z'
            };

            const dbError = new Error('Database connection failed');
            Assignment.create.mockRejectedValue(dbError);

            await createAssignment(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(dbError);
        });
    });

    describe('getAssignmentsForClass', () => {
        it('should retrieve assignments for a classroom', async () => {
            const mockAssignments = [
                {
                    _id: 'assignment1',
                    title: 'Assignment 1',
                    teacher: { name: 'Teacher One' },
                    dueDate: '2025-12-31T00:00:00.000Z'
                },
                {
                    _id: 'assignment2',
                    title: 'Assignment 2',
                    teacher: { name: 'Teacher Two' },
                    dueDate: '2025-12-30T00:00:00.000Z'
                }
            ];

            mockReq.params = { classroomId: 'class123' };

            // Mock the complete chain
            const sortMock = vi.fn().mockResolvedValue(mockAssignments);
            const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
            Assignment.find.mockReturnValue({ populate: populateMock });

            await getAssignmentsForClass(mockReq, mockRes, mockNext);

            expect(Assignment.find).toHaveBeenCalledWith({
                classroom: 'class123',
                status: 'published'
            });
            expect(populateMock).toHaveBeenCalledWith('teacher', 'name');
            expect(sortMock).toHaveBeenCalledWith({ dueDate: -1 });

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Assignments retrieved successfully.',
                data: mockAssignments
            });
        });

        it('should handle empty results', async () => {
            mockReq.params = { classroomId: 'class123' };

            const sortMock = vi.fn().mockResolvedValue([]);
            const populateMock = vi.fn().mockReturnValue({ sort: sortMock });
            Assignment.find.mockReturnValue({ populate: populateMock });

            await getAssignmentsForClass(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Assignments retrieved successfully.',
                data: []
            });
        });
    });

    describe('submitAssignment', () => {
        beforeEach(() => {
            mockReq.user.studentProfile = 'student123';
            mockReq.user.role = 'student';
        });

        it('should submit assignment successfully when on time', async () => {
            const mockAssignment = {
                _id: 'assignment123',
                dueDate: new Date('2025-12-31T23:59:59.000Z')
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

            // Mock current date to be before due date
            const mockDate = new Date('2025-12-30T12:00:00.000Z');
            vi.useFakeTimers();
            vi.setSystemTime(mockDate);

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

            vi.useRealTimers();
        });

        it('should submit assignment as late when past due date', async () => {
            const mockAssignment = {
                _id: 'assignment123',
                dueDate: new Date('2025-12-29T23:59:59.000Z') // Past due date
            };

            const mockSubmission = {
                _id: 'submission123',
                assignment: 'assignment123',
                student: 'student123',
                textSubmission: 'My late submission',
                status: 'late'
            };

            mockReq.params = { id: 'assignment123' };
            mockReq.body = { textSubmission: 'My late submission' };

            Assignment.findById.mockResolvedValue(mockAssignment);
            AssignmentSubmission.findOne.mockResolvedValue(null);
            AssignmentSubmission.create.mockResolvedValue(mockSubmission);

            // Mock current date to be after due date
            const mockDate = new Date('2025-12-30T12:00:00.000Z');
            vi.useFakeTimers();
            vi.setSystemTime(mockDate);

            await submitAssignment(mockReq, mockRes, mockNext);

            expect(AssignmentSubmission.create).toHaveBeenCalledWith({
                assignment: 'assignment123',
                student: 'student123',
                textSubmission: 'My late submission',
                status: 'late'
            });

            expect(mockRes.status).toHaveBeenCalledWith(201);

            vi.useRealTimers();
        });

        it('should reject non-student users', async () => {
            mockReq.user.studentProfile = null; // No student profile

            const AppError = (await import('../../../utils/AppError.js')).default;

            await submitAssignment(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(
                expect.any(AppError)
            );
            expect(mockNext.mock.calls[0][0].message).toBe('You must be a student to submit an assignment.');
            expect(mockNext.mock.calls[0][0].statusCode).toBe(403);
        });

        it('should handle missing assignment', async () => {
            mockReq.params = { id: 'nonexistent' };
            mockReq.body = { textSubmission: 'My submission' };

            Assignment.findById.mockResolvedValue(null);

            const AppError = (await import('../../../utils/AppError.js')).default;

            await submitAssignment(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(
                expect.any(AppError)
            );
            expect(mockNext.mock.calls[0][0].message).toBe('Assignment not found.');
            expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
        });

        it('should prevent duplicate submissions', async () => {
            const mockAssignment = {
                _id: 'assignment123',
                dueDate: new Date('2025-12-31T23:59:59.000Z')
            };

            const existingSubmission = {
                _id: 'existing123',
                assignment: 'assignment123',
                student: 'student123',
                status: 'submitted'
            };

            mockReq.params = { id: 'assignment123' };
            mockReq.body = { textSubmission: 'My submission' };

            Assignment.findById.mockResolvedValue(mockAssignment);
            AssignmentSubmission.findOne.mockResolvedValue(existingSubmission);

            const AppError = (await import('../../../utils/AppError.js')).default;

            await submitAssignment(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(
                expect.any(AppError)
            );
            expect(mockNext.mock.calls[0][0].message).toBe('You have already submitted this assignment.');
            expect(mockNext.mock.calls[0][0].statusCode).toBe(409);
        });
    });

    describe('gradeSubmission', () => {
        it('should grade submission successfully', async () => {
            const mockSubmission = {
                _id: 'submission123',
                grade: 'A',
                feedback: 'Excellent work!',
                status: 'graded',
                gradedBy: 'teacher123'
            };

            mockReq.params = { submissionId: 'submission123' };
            mockReq.body = { grade: 'A', feedback: 'Excellent work!' };

            AssignmentSubmission.findByIdAndUpdate.mockResolvedValue(mockSubmission);

            await gradeSubmission(mockReq, mockRes, mockNext);

            expect(AssignmentSubmission.findByIdAndUpdate).toHaveBeenCalledWith(
                'submission123',
                {
                    grade: 'A',
                    feedback: 'Excellent work!',
                    status: 'graded',
                    gradedBy: 'teacher123'
                },
                { new: true }
            );

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Submission graded successfully.',
                data: mockSubmission
            });
        });

        it('should handle missing submission', async () => {
            mockReq.params = { submissionId: 'nonexistent' };
            mockReq.body = { grade: 'A', feedback: 'Good work!' };

            AssignmentSubmission.findByIdAndUpdate.mockResolvedValue(null);

            const AppError = (await import('../../../utils/AppError.js')).default;

            await gradeSubmission(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(
                expect.any(AppError)
            );
            expect(mockNext.mock.calls[0][0].message).toBe('Submission not found.');
            expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
        });

        it('should handle database errors during grading', async () => {
            mockReq.params = { submissionId: 'submission123' };
            mockReq.body = { grade: 'A', feedback: 'Good work!' };

            const dbError = new Error('Database update failed');
            AssignmentSubmission.findByIdAndUpdate.mockRejectedValue(dbError);

            await gradeSubmission(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(dbError);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});