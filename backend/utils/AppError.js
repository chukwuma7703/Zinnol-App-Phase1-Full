/**
 * Custom error class to create operational, catchable errors.
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - The error message.
   * @param {number} statusCode - The HTTP status code.
   */
  constructor(message, statusCode = 500) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Flag for operational errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - for input validation failures
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.type = 'VALIDATION_ERROR';
    this.details = details;
  }
}

/**
 * Authentication Error - for auth-related failures
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.type = 'AUTHENTICATION_ERROR';
  }
}

/**
 * Authorization Error - for permission-related failures
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
    this.type = 'AUTHORIZATION_ERROR';
  }
}

/**
 * Forbidden Error - alias for AuthorizationError (HTTP 403)
 */
export class ForbiddenError extends AuthorizationError {
  constructor(message = 'Access forbidden') {
    super(message);
    this.type = 'FORBIDDEN_ERROR';
  }
}

/**
 * Not Found Error - for resource not found
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.type = 'NOT_FOUND_ERROR';
  }
}

/**
 * Conflict Error - for resource conflicts
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.type = 'CONFLICT_ERROR';
  }
}

/**
 * Database Error - for database operation failures
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500);
    this.type = 'DATABASE_ERROR';
    this.originalError = originalError;
  }
}

/**
 * External Service Error - for third-party API failures
 */
export class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error') {
    super(`${service}: ${message}`, 502);
    this.type = 'EXTERNAL_SERVICE_ERROR';
    this.service = service;
  }
}

export default AppError;

