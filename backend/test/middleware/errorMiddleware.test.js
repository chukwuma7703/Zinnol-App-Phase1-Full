import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import errorHandler from '../../middleware/errorMiddleware.js';
import {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    DatabaseError,
    ExternalServiceError
} from '../../utils/AppError.js';
import { MulterError } from 'multer';

describe('Error Handler Middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        mockReq = {
            originalUrl: '/test',
            method: 'GET',
            ip: '127.0.0.1',
            get: vi.fn().mockReturnValue('test-agent')
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        mockNext = vi.fn();

        // Mock console methods
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('ValidationError handling', () => {
        it('should handle ValidationError with details', () => {
            const error = new ValidationError('Invalid input', { field: 'email', issue: 'invalid format' });

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'VALIDATION_ERROR',
                message: 'Invalid input',
                details: { field: 'email', issue: 'invalid format' },
                timestamp: expect.any(String)
            });
        });
    });

    describe('AuthenticationError handling', () => {
        it('should handle AuthenticationError', () => {
            const error = new AuthenticationError('Invalid credentials');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'AUTHENTICATION_ERROR',
                message: 'Invalid credentials',
                timestamp: expect.any(String)
            });
        });
    });

    describe('AuthorizationError handling', () => {
        it('should handle AuthorizationError', () => {
            const error = new AuthorizationError('Access denied');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'AUTHORIZATION_ERROR',
                message: 'Access denied',
                timestamp: expect.any(String)
            });
        });
    });

    describe('NotFoundError handling', () => {
        it('should handle NotFoundError', () => {
            const error = new NotFoundError('User');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'NOT_FOUND_ERROR',
                message: 'User not found',
                timestamp: expect.any(String)
            });
        });
    });

    describe('ConflictError handling', () => {
        it('should handle ConflictError', () => {
            const error = new ConflictError('Resource already exists');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(409);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'CONFLICT_ERROR',
                message: 'Resource already exists',
                timestamp: expect.any(String)
            });
        });
    });

    describe('DatabaseError handling', () => {
        it('should handle DatabaseError in development', () => {
            process.env.NODE_ENV = 'development';
            const originalError = new Error('Connection failed');
            const error = new DatabaseError('Database operation failed', originalError);

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'DATABASE_ERROR',
                message: 'Database operation failed',
                timestamp: expect.any(String)
            });
            expect(console.error).toHaveBeenCalledWith('Database Error:', originalError);
        });

        it('should handle DatabaseError in production', () => {
            process.env.NODE_ENV = 'production';
            const error = new DatabaseError('Database operation failed');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'DATABASE_ERROR',
                message: 'A database error occurred',
                timestamp: expect.any(String)
            });
        });
    });

    describe('ExternalServiceError handling', () => {
        it('should handle ExternalServiceError in development', () => {
            process.env.NODE_ENV = 'development';
            const error = new ExternalServiceError('payment-service', 'Service unavailable');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'EXTERNAL_SERVICE_ERROR',
                message: 'payment-service: Service unavailable',
                service: 'payment-service',
                timestamp: expect.any(String)
            });
            expect(console.error).toHaveBeenCalledWith('Error:', error);
            expect(console.error).toHaveBeenCalledWith('External Service Error (payment-service):', 'payment-service: Service unavailable');
        });

        it('should handle ExternalServiceError in production', () => {
            process.env.NODE_ENV = 'production';
            const error = new ExternalServiceError('payment-service', 'Service unavailable');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'EXTERNAL_SERVICE_ERROR',
                message: 'An external service is currently unavailable',
                service: 'payment-service',
                timestamp: expect.any(String)
            });
        });
    });

    describe('MulterError handling', () => {
        it('should handle LIMIT_FILE_SIZE error', () => {
            const error = new MulterError('LIMIT_FILE_SIZE');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'FILE_UPLOAD_ERROR',
                message: 'File too large. Maximum size is 5MB.',
                timestamp: expect.any(String)
            });
        });

        it('should handle LIMIT_FILE_COUNT error', () => {
            const error = new MulterError('LIMIT_FILE_COUNT');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'FILE_UPLOAD_ERROR',
                message: 'Too many files uploaded.',
                timestamp: expect.any(String)
            });
        });

        it('should handle other MulterError codes', () => {
            const error = new MulterError('OTHER_ERROR');
            error.message = 'Custom multer error';

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'FILE_UPLOAD_ERROR',
                message: 'Custom multer error',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Mongoose ValidationError handling', () => {
        it('should handle Mongoose ValidationError', () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                email: { path: 'email', message: 'Invalid email', value: 'invalid' },
                name: { path: 'name', message: 'Name required', value: '' }
            };

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [
                    { field: 'email', message: 'Invalid email', value: 'invalid' },
                    { field: 'name', message: 'Name required', value: '' }
                ],
                timestamp: expect.any(String)
            });
        });
    });

    describe('Mongoose CastError handling', () => {
        it('should handle Mongoose CastError', () => {
            const error = new Error('Cast failed');
            error.name = 'CastError';
            error.path = 'userId';
            error.value = 'invalid-id';

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'VALIDATION_ERROR',
                message: 'Invalid userId: invalid-id',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Mongoose duplicate key error handling', () => {
        it('should handle duplicate key error', () => {
            const error = new Error('Duplicate key');
            error.code = 11000;
            error.keyValue = { email: 'test@example.com' };

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(409);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'CONFLICT_ERROR',
                message: "email 'test@example.com' already exists",
                timestamp: expect.any(String)
            });
        });
    });

    describe('JWT error handling', () => {
        it('should handle JsonWebTokenError', () => {
            const error = new Error('Invalid token');
            error.name = 'JsonWebTokenError';

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'AUTHENTICATION_ERROR',
                message: 'Invalid token',
                timestamp: expect.any(String)
            });
        });

        it('should handle TokenExpiredError', () => {
            const error = new Error('Token expired');
            error.name = 'TokenExpiredError';

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'AUTHENTICATION_ERROR',
                message: 'Token expired',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Generic AppError handling', () => {
        it('should handle generic AppError', () => {
            const error = new AppError('Custom error', 422);
            error.type = 'CUSTOM_ERROR';

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(422);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'CUSTOM_ERROR',
                message: 'Custom error',
                timestamp: expect.any(String)
            });
        });

        it('should handle AppError without type', () => {
            const error = new AppError('Generic error', 422);

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(422);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'APP_ERROR',
                message: 'Generic error',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Unknown error handling', () => {
        it('should handle unknown errors in development', () => {
            process.env.NODE_ENV = 'development';
            const error = new Error('Unknown error');
            error.stack = 'Error stack trace';

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'INTERNAL_SERVER_ERROR',
                message: 'Unknown error',
                stack: 'Error stack trace',
                timestamp: expect.any(String)
            });
            expect(console.error).toHaveBeenCalledWith('Unexpected Error:', {
                message: 'Unknown error',
                stack: 'Error stack trace',
                url: '/test',
                method: 'GET',
                ip: '127.0.0.1',
                userAgent: 'test-agent'
            });
        });

        it('should handle unknown errors in production', () => {
            process.env.NODE_ENV = 'production';
            const error = new Error('Unknown error');

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                type: 'INTERNAL_SERVER_ERROR',
                message: 'Something went wrong',
                timestamp: expect.any(String)
            });
        });

        it('should handle errors with custom statusCode', () => {
            const error = new Error('Custom status error');
            error.statusCode = 422;

            errorHandler(error, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(422);
        });
    });
});
