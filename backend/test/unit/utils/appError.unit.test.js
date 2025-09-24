import { AppError, ValidationError, AuthorizationError } from '../../../utils/AppError.js';

describe('AppError hierarchy', () => {
    test('base AppError sets core properties', () => {
        const err = new AppError('Failure', 418);
        expect(err.message).toBe('Failure');
        expect(err.statusCode).toBe(418);
        expect(err.isOperational).toBe(true);
        expect(err.status).toBe('fail'); // 4xx maps to fail
    });

    test('ValidationError sets type and 400', () => {
        const err = new ValidationError('Bad');
        expect(err.statusCode).toBe(400);
        expect(err.type).toBe('VALIDATION_ERROR');
    });

    test('AuthorizationError sets type and 403', () => {
        const err = new AuthorizationError('No');
        expect(err.statusCode).toBe(403);
        expect(err.type).toBe('AUTHORIZATION_ERROR');
    });
});
