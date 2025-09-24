import { MulterError } from "multer";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError
} from "../utils/AppError.js";

/**
 * Global error handler middleware
 * Provides consistent error responses across the application
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging (in development)
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  // Handle specific error types
  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      type: 'VALIDATION_ERROR',
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString()
    });
  }

  if (err instanceof AuthenticationError) {
    return res.status(401).json({
      success: false,
      type: 'AUTHENTICATION_ERROR',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err instanceof AuthorizationError) {
    return res.status(403).json({
      success: false,
      type: 'AUTHORIZATION_ERROR',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      success: false,
      type: 'NOT_FOUND_ERROR',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err instanceof ConflictError) {
    return res.status(409).json({
      success: false,
      type: 'CONFLICT_ERROR',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err instanceof DatabaseError) {
    // Log database errors for monitoring
    console.error('Database Error:', err.originalError);

    return res.status(500).json({
      success: false,
      type: 'DATABASE_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'A database error occurred'
        : err.message,
      timestamp: new Date().toISOString()
    });
  }

  if (err instanceof ExternalServiceError) {
    // Log external service errors
    console.error(`External Service Error (${err.service}):`, err.message);

    return res.status(502).json({
      success: false,
      type: 'EXTERNAL_SERVICE_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An external service is currently unavailable'
        : err.message,
      service: err.service,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Multer errors specifically
  if (err instanceof MulterError) {
    let message = 'File upload error';

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large. Maximum size is 5MB.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field.';
        break;
      default:
        message = err.message;
    }

    return res.status(400).json({
      success: false,
      type: 'FILE_UPLOAD_ERROR',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));

    return res.status(400).json({
      success: false,
      type: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      type: 'VALIDATION_ERROR',
      message: `Invalid ${err.path}: ${err.value}`,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];

    return res.status(409).json({
      success: false,
      type: 'CONFLICT_ERROR',
      message: `${field} '${value}' already exists`,
      timestamp: new Date().toISOString()
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      type: 'AUTHENTICATION_ERROR',
      message: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      type: 'AUTHENTICATION_ERROR',
      message: 'Token expired',
      timestamp: new Date().toISOString()
    });
  }

  // Handle generic AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      type: err.type || 'APP_ERROR',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }

  // Handle unknown errors
  const statusCode = err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log unexpected errors for monitoring
  console.error('Unexpected Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(statusCode).json({
    success: false,
    type: 'INTERNAL_SERVER_ERROR',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
};

export default errorHandler;
