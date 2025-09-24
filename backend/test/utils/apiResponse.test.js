import { describe, it, expect } from 'vitest';
import { ApiResponse } from '../../utils/ApiResponse';

describe('ApiResponse', () => {
    describe('Constructor', () => {
        it('should create a success response', () => {
            const response = new ApiResponse(200, { user: 'test' }, 'User created');

            expect(response.statusCode).toBe(200);
            expect(response.data).toEqual({ user: 'test' });
            expect(response.message).toBe('User created');
            expect(response.success).toBe(true);
        });

        it('should create an error response', () => {
            const response = new ApiResponse(404, null, 'Not found');

            expect(response.statusCode).toBe(404);
            expect(response.data).toBe(null);
            expect(response.message).toBe('Not found');
            expect(response.success).toBe(false);
        });

        it('should default message to "Success"', () => {
            const response = new ApiResponse(201, { id: 1 });

            expect(response.statusCode).toBe(201);
            expect(response.data).toEqual({ id: 1 });
            expect(response.message).toBe('Success');
            expect(response.success).toBe(true);
        });

        it('should set success to false for 4xx status codes', () => {
            const response = new ApiResponse(400, null, 'Bad request');

            expect(response.success).toBe(false);
        });

        it('should set success to false for 5xx status codes', () => {
            const response = new ApiResponse(500, null, 'Internal server error');

            expect(response.success).toBe(false);
        });

        it('should set success to true for 2xx status codes', () => {
            const response = new ApiResponse(201, { created: true }, 'Created');

            expect(response.success).toBe(true);
        });

        it('should set success to true for 3xx status codes', () => {
            const response = new ApiResponse(301, null, 'Moved permanently');

            expect(response.success).toBe(true);
        });
    });
});
