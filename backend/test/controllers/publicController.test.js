import { vi, describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Classic vi.mock pattern (no top-level await) for CommonJS transpiled context
vi.mock('../../models/ShareToken.js', () => ({
    __esModule: true,
    default: { findOne: vi.fn() }
}));
vi.mock('../../models/Result.js', () => ({
    __esModule: true,
    default: { aggregate: vi.fn() }
}));
vi.mock('../../utils/AppError.js', () => ({
    __esModule: true,
    default: function (message, statusCode) { const e = new Error(message); e.statusCode = statusCode; return e; }
}));

// Pull mocked references after vi.mock declarations
import ShareToken from '../../models/ShareToken.js';
import Result from '../../models/Result.js';

// Import after mocks
import { getSharedAnalytics } from '../../controllers/publicController.js';

describe('Public Controller', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        vi.clearAllMocks();

        mockReq = { params: {} };
        mockRes = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
        };
        mockNext = vi.fn();
    });

    describe('getSharedAnalytics', () => {
        it('should return student analytics for valid token', async () => {
            const mockToken = 'valid-token';
            const studentId = new mongoose.Types.ObjectId().toString();
            const mockShareToken = {
                token: mockToken,
                type: 'student-analytics',
                targetId: studentId,
                expiresAt: new Date(Date.now() + 3600000),
            };
            const mockPerformanceHistory = [
                { date: '2025-01-01', score: 85 },
                { date: '2025-01-02', score: 90 },
            ];

            mockReq.params.token = mockToken;
            ShareToken.findOne.mockResolvedValue(mockShareToken);
            Result.aggregate.mockResolvedValue(mockPerformanceHistory);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockNext).not.toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Student analytics retrieved successfully.',
                performanceHistory: mockPerformanceHistory,
                termAnalysis: {},
            });
        });

        it('should return 404 for invalid token', async () => {
            mockReq.params.token = 'invalid-token';
            ShareToken.findOne.mockResolvedValue(null);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const err = mockNext.mock.calls[0][0];
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('Invalid or expired link.');
            expect(err.statusCode).toBe(404);
        });

        it('should return 410 for expired token', async () => {
            const mockToken = 'expired-token';
            const mockShareToken = {
                token: mockToken,
                expiresAt: new Date(Date.now() - 3600000), // Past
            };
            mockReq.params.token = mockToken;
            ShareToken.findOne.mockResolvedValue(mockShareToken);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const err = mockNext.mock.calls[0][0];
            expect(err.message).toBe('This share link has expired.');
            expect(err.statusCode).toBe(410);
        });

        it('should return 400 for unsupported analytics type', async () => {
            const mockToken = 'unsupported-token';
            const mockShareToken = {
                token: mockToken,
                type: 'unsupported-type',
                expiresAt: new Date(Date.now() + 3600000),
            };
            mockReq.params.token = mockToken;
            ShareToken.findOne.mockResolvedValue(mockShareToken);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const err = mockNext.mock.calls[0][0];
            expect(err.message).toBe('Unsupported analytics type for this share link.');
            expect(err.statusCode).toBe(400);
        });

        it('should handle database errors when finding share token', async () => {
            const error = new Error('Database connection failed');
            ShareToken.findOne.mockRejectedValue(error);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should handle database errors during aggregation', async () => {
            const mockShareToken = {
                token: 'valid-token',
                type: 'student-analytics',
                targetId: new mongoose.Types.ObjectId().toString(),
                expiresAt: new Date(Date.now() + 3600000),
            };
            ShareToken.findOne.mockResolvedValue(mockShareToken);
            const error = new Error('Aggregation failed');
            Result.aggregate.mockRejectedValue(error);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
        });

        it('should return empty performance history when no results found', async () => {
            const mockShareToken = {
                token: 'valid-token',
                type: 'student-analytics',
                targetId: new mongoose.Types.ObjectId().toString(),
                expiresAt: new Date(Date.now() + 3600000),
            };
            mockReq.params.token = 'valid-token';
            ShareToken.findOne.mockResolvedValue(mockShareToken);
            Result.aggregate.mockResolvedValue([]);

            await getSharedAnalytics(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith({
                message: 'Student analytics retrieved successfully.',
                performanceHistory: [],
                termAnalysis: {},
            });
        });
    });
});
