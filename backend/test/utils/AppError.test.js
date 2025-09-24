/**
 * AppError Utility Test
 */

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError
} from '../../utils/AppError.js';

describe('AppError', () => {
  it('should create an error with message and status code', () => {
    const error = new AppError('Test error', 400);

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
    expect(error.status).toBe('fail');
  });

  it('should set status to error for 5xx codes', () => {
    const error = new AppError('Server error', 500);

    expect(error.status).toBe('error');
  });

  it('should default to 500 status code', () => {
    const error = new AppError('Error');

    expect(error.statusCode).toBe(500);
    expect(error.status).toBe('error');
  });
});

describe('ValidationError', () => {
  it('should create a validation error with 400 status', () => {
    const error = new ValidationError('Invalid input');

    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.type).toBe('VALIDATION_ERROR');
    expect(error.status).toBe('fail');
  });

  it('should include validation details when provided', () => {
    const details = { field: 'email', issue: 'invalid format' };
    const error = new ValidationError('Email validation failed', details);

    expect(error.details).toEqual(details);
  });
});

describe('AuthenticationError', () => {
  it('should create an authentication error with 401 status', () => {
    const error = new AuthenticationError('Invalid credentials');

    expect(error.message).toBe('Invalid credentials');
    expect(error.statusCode).toBe(401);
    expect(error.type).toBe('AUTHENTICATION_ERROR');
    expect(error.status).toBe('fail');
  });

  it('should use default message when none provided', () => {
    const error = new AuthenticationError();

    expect(error.message).toBe('Authentication failed');
  });
});

describe('AuthorizationError', () => {
  it('should create an authorization error with 403 status', () => {
    const error = new AuthorizationError('Access denied');

    expect(error.message).toBe('Access denied');
    expect(error.statusCode).toBe(403);
    expect(error.type).toBe('AUTHORIZATION_ERROR');
    expect(error.status).toBe('fail');
  });

  it('should use default message when none provided', () => {
    const error = new AuthorizationError();

    expect(error.message).toBe('Insufficient permissions');
  });
});

describe('ForbiddenError', () => {
  it('should create a forbidden error with 403 status', () => {
    const error = new ForbiddenError('Access forbidden');

    expect(error.message).toBe('Access forbidden');
    expect(error.statusCode).toBe(403);
    expect(error.type).toBe('FORBIDDEN_ERROR');
    expect(error.status).toBe('fail');
  });

  it('should use default message when none provided', () => {
    const error = new ForbiddenError();

    expect(error.message).toBe('Access forbidden');
  });
});

describe('NotFoundError', () => {
  it('should create a not found error with 404 status', () => {
    const error = new NotFoundError('User');

    expect(error.message).toBe('User not found');
    expect(error.statusCode).toBe(404);
    expect(error.type).toBe('NOT_FOUND_ERROR');
    expect(error.status).toBe('fail');
  });

  it('should use default resource when none provided', () => {
    const error = new NotFoundError();

    expect(error.message).toBe('Resource not found');
  });
});

describe('ConflictError', () => {
  it('should create a conflict error with 409 status', () => {
    const error = new ConflictError('Resource already exists');

    expect(error.message).toBe('Resource already exists');
    expect(error.statusCode).toBe(409);
    expect(error.type).toBe('CONFLICT_ERROR');
    expect(error.status).toBe('fail');
  });

  it('should use default message when none provided', () => {
    const error = new ConflictError();

    expect(error.message).toBe('Resource conflict');
  });
});

describe('DatabaseError', () => {
  it('should create a database error with 500 status', () => {
    const originalError = new Error('Connection failed');
    const error = new DatabaseError('Query failed', originalError);

    expect(error.message).toBe('Query failed');
    expect(error.statusCode).toBe(500);
    expect(error.type).toBe('DATABASE_ERROR');
    expect(error.originalError).toBe(originalError);
    expect(error.status).toBe('error');
  });

  it('should use default message when none provided', () => {
    const error = new DatabaseError();

    expect(error.message).toBe('Database operation failed');
    expect(error.originalError).toBe(null);
  });
});

describe('ExternalServiceError', () => {
  it('should create an external service error with 502 status', () => {
    const error = new ExternalServiceError('Google API', 'Rate limit exceeded');

    expect(error.message).toBe('Google API: Rate limit exceeded');
    expect(error.statusCode).toBe(502);
    expect(error.type).toBe('EXTERNAL_SERVICE_ERROR');
    expect(error.service).toBe('Google API');
    expect(error.status).toBe('error');
  });

  it('should use default message when none provided', () => {
    const error = new ExternalServiceError('Stripe');

    expect(error.message).toBe('Stripe: External service error');
  });
});