import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach } from '@jest/globals';
import errorMiddleware from './errorMiddleware.js';
import AppError from '../utils/AppError.js';

describe('Error Middleware Complete Tests', () => {
  let req, res, next;
  
  beforeEach(() => {
    req = {
      originalUrl: '/api/test',
      method: 'GET',
      ip: '127.0.0.1'
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false
    };
    
    next = jest.fn();
    
    // Reset environment
    process.env.NODE_ENV = 'development';
  });

  describe('AppError Handling', () => {
    it('should handle AppError with status code', () => {
      const error = new AppError('Test error', 400);
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Test error'
      }));
    });

    it('should handle AppError without status code', () => {
      const error = new AppError('Test error');
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Validation Errors', () => {
    it('should handle Mongoose validation error', () => {
      const error = {
        name: 'ValidationError',
        errors: {
          name: { message: 'Name is required' },
          email: { message: 'Invalid email format' }
        }
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Validation Error')
      }));
    });

    it('should handle cast error', () => {
      const error = {
        name: 'CastError',
        path: '_id',
        value: 'invalid-id'
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Invalid _id: invalid-id'
      }));
    });
  });

  describe('MongoDB Errors', () => {
    it('should handle duplicate key error', () => {
      const error = {
        code: 11000,
        keyValue: { email: 'duplicate@example.com' }
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('already exists')
      }));
    });

    it('should handle duplicate key error with keyPattern', () => {
      const error = {
        code: 11000,
        keyPattern: { username: 1 }
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('JWT Errors', () => {
    it('should handle JsonWebTokenError', () => {
      const error = {
        name: 'JsonWebTokenError'
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Invalid token. Please log in again.'
      }));
    });

    it('should handle TokenExpiredError', () => {
      const error = {
        name: 'TokenExpiredError'
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Your token has expired. Please log in again.'
      }));
    });
  });

  describe('Multer Errors', () => {
    it('should handle file too large error', () => {
      const error = {
        code: 'LIMIT_FILE_SIZE'
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'File too large'
      }));
    });

    it('should handle unexpected file error', () => {
      const error = {
        code: 'LIMIT_UNEXPECTED_FILE'
      };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Unexpected file upload'
      }));
    });
  });

  describe('Environment-specific Handling', () => {
    it('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      
      errorMiddleware(error, req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        stack: 'Error stack trace'
      }));
    });

    it('should not include stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      
      errorMiddleware(error, req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(
        expect.not.objectContaining({
          stack: expect.anything()
        })
      );
    });

    it('should sanitize error message in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Database connection failed at 192.168.1.1');
      
      errorMiddleware(error, req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Something went wrong!'
      }));
    });
  });

  describe('Edge Cases', () => {
    it('should handle error with no message', () => {
      const error = new Error();
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false
      }));
    });

    it('should handle non-Error objects', () => {
      const error = { custom: 'error object' };
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle string errors', () => {
      const error = 'String error message';
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should not send response if headers already sent', () => {
      res.headersSent = true;
      const error = new Error('Test error');
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('Operational vs Programming Errors', () => {
    it('should handle operational errors', () => {
      const error = new AppError('Operational error', 400);
      error.isOperational = true;
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Operational error'
      }));
    });

    it('should handle programming errors differently in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Programming error');
      error.isOperational = false;
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Something went wrong!'
      }));
    });
  });

  describe('Request Information', () => {
    it('should include request info in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      
      errorMiddleware(error, req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        path: '/api/test',
        method: 'GET'
      }));
    });

    it('should handle missing request info gracefully', () => {
      req = {};
      const error = new Error('Test error');
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Status Code Handling', () => {
    it('should use 500 for errors without status code', () => {
      const error = new Error('Test error');
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should respect custom status codes', () => {
      const error = new Error('Test error');
      error.statusCode = 403;
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should handle status property', () => {
      const error = new Error('Test error');
      error.status = 404;
      
      errorMiddleware(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});