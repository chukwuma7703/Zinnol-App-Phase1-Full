import { vi, describe, it, expect, beforeEach } from 'vitest';
import AppError from '../../utils/AppError.js';

// Create mock objects
const Student = {
    find: vi.fn()
};

const Subject = {
    find: vi.fn()
};

const Result = {
    create: vi.fn()
};

// Mock the modules at the top level
vi.mock('../../models/Student.js', () => ({
    default: Student
}));

vi.mock('../../models/Subject.js', () => ({
    default: Subject
}));

vi.mock('../../models/Result.js', () => ({
    default: Result
}));

vi.mock('../../utils/AppError.js', () => ({
    default: function (message, statusCode) {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    }
}));

describe('Voice Result Controller', () => {
    let voiceResultEntry;
    let mockReq, mockRes, mockNext;

    beforeEach(async () => {
        vi.resetModules();

        const voiceResultModule = await import('../../controllers/voiceResultController.js');
        voiceResultEntry = voiceResultModule.voiceResultEntry;

        mockReq = {
            body: {},
            user: { _id: 'teacher123', school: 'school123' }
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        mockNext = vi.fn();

        vi.clearAllMocks();
    });

    describe('voiceResultEntry', () => {
        it('should successfully create a voice result entry', async () => {
            const mockStudents = [
                { _id: 'student1', firstName: 'John', lastName: 'Doe' },
                { _id: 'student2', firstName: 'Jane', lastName: 'Smith' }
            ];

            const mockSubjects = [
                { _id: 'subject1', name: 'Mathematics' },
                { _id: 'subject2', name: 'English' }
            ];

            const mockResult = {
                _id: 'result1',
                student: 'student1',
                subject: 'subject1',
                score: 85,
                enteredBy: 'teacher123',
                entryMethod: 'voice'
            };

            mockReq.body = {
                student: 'John Doe',
                subject: 'Math',
                score: 85
            };

            Student.find.mockResolvedValue(mockStudents);
            Subject.find.mockResolvedValue(mockSubjects);
            Result.create.mockResolvedValue(mockResult);

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(Student.find).toHaveBeenCalledWith({ school: 'school123' });
            expect(Subject.find).toHaveBeenCalledWith({ school: 'school123' });
            expect(Result.create).toHaveBeenCalledWith({
                student: 'student1',
                subject: 'subject1',
                score: 85,
                enteredBy: 'teacher123',
                entryMethod: 'voice'
            });
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Result recorded for John Doe in Mathematics: 85',
                result: mockResult
            });
        });

        it('should use mock school ID when user has no school', async () => {
            const mockStudents = [
                { _id: 'student1', firstName: 'John', lastName: 'Doe' }
            ];

            const mockSubjects = [
                { _id: 'subject1', name: 'Mathematics' }
            ];

            const mockResult = {
                _id: 'result1',
                student: 'student1',
                subject: 'subject1',
                score: 90,
                enteredBy: '507f1f77bcf86cd799439011',
                entryMethod: 'voice'
            };

            mockReq.body = {
                student: 'John Doe',
                subject: 'Mathematics',
                score: 90
            };
            mockReq.user = { _id: 'teacher123' }; // No school property

            Student.find.mockResolvedValue(mockStudents);
            Subject.find.mockResolvedValue(mockSubjects);
            Result.create.mockResolvedValue(mockResult);

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(Student.find).toHaveBeenCalledWith({ school: '507f1f77bcf86cd799439011' });
            expect(Subject.find).toHaveBeenCalledWith({ school: '507f1f77bcf86cd799439011' });
            expect(Result.create).toHaveBeenCalledWith({
                student: 'student1',
                subject: 'subject1',
                score: 90,
                enteredBy: 'teacher123',
                entryMethod: 'voice'
            });
        });

        it('should return 400 for missing required fields', async () => {
            mockReq.body = { student: 'John Doe' }; // Missing subject and score

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new AppError('Missing student, subject, or score', 400));
        });

        it('should return 400 for invalid score type', async () => {
            mockReq.body = {
                student: 'John Doe',
                subject: 'Math',
                score: '85' // String instead of number
            };

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new AppError('Missing student, subject, or score', 400));
        });

        it('should return 404 for student not found', async () => {
            mockReq.body = {
                student: 'Nonexistent Student',
                subject: 'Math',
                score: 85
            };

            Student.find.mockResolvedValue([
                { _id: 'student1', firstName: 'John', lastName: 'Doe' }
            ]);
            Subject.find.mockResolvedValue([
                { _id: 'subject1', name: 'Mathematics' }
            ]);

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new AppError('Student not found', 404));
        });

        it('should return 404 for subject not found', async () => {
            mockReq.body = {
                student: 'John Doe',
                subject: 'Nonexistent Subject',
                score: 85
            };

            Student.find.mockResolvedValue([
                { _id: 'student1', firstName: 'John', lastName: 'Doe' }
            ]);
            Subject.find.mockResolvedValue([
                { _id: 'subject1', name: 'Mathematics' }
            ]);

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new AppError('Subject not found', 404));
        });

        it('should handle fuzzy matching for student names', async () => {
            const mockStudents = [
                { _id: 'student1', firstName: 'Jonathan', lastName: 'Doe' }
            ];

            const mockSubjects = [
                { _id: 'subject1', name: 'Mathematics' }
            ];

            const mockResult = {
                _id: 'result1',
                student: 'student1',
                subject: 'subject1',
                score: 88,
                enteredBy: 'teacher123',
                entryMethod: 'voice'
            };

            mockReq.body = {
                student: 'Jonathan', // Exact match for firstName
                subject: 'Mathematics', // Exact match
                score: 88
            };

            Student.find.mockResolvedValue(mockStudents);
            Subject.find.mockResolvedValue(mockSubjects);
            Result.create.mockResolvedValue(mockResult);

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(Result.create).toHaveBeenCalledWith({
                student: 'student1',
                subject: 'subject1',
                score: 88,
                enteredBy: 'teacher123',
                entryMethod: 'voice'
            });
        });

        it('should handle database errors when finding students', async () => {
            const error = new Error('Database connection failed');
            mockReq.body = {
                student: 'John Doe',
                subject: 'Math',
                score: 85
            };

            Student.find.mockRejectedValue(error);

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should handle database errors when finding subjects', async () => {
            mockReq.body = {
                student: 'John Doe',
                subject: 'Math',
                score: 85
            };

            Student.find.mockResolvedValue([
                { _id: 'student1', firstName: 'John', lastName: 'Doe' }
            ]);
            Subject.find.mockRejectedValue(new Error('Subject query failed'));

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new Error('Subject query failed'));
        });

        it('should handle database errors when creating result', async () => {
            const mockStudents = [
                { _id: 'student1', firstName: 'John', lastName: 'Doe' }
            ];

            const mockSubjects = [
                { _id: 'subject1', name: 'Mathematics' }
            ];

            mockReq.body = {
                student: 'John Doe',
                subject: 'Mathematics',
                score: 85
            };

            Student.find.mockResolvedValue(mockStudents);
            Subject.find.mockResolvedValue(mockSubjects);
            Result.create.mockRejectedValue(new Error('Result creation failed'));

            await voiceResultEntry(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new Error('Result creation failed'));
        });
    });
});
