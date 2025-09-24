import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock all dependencies before importing the controller
jest.mock('../models/userModel.js', () => ({
  default: {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn()
  }
}));

jest.mock('../models/refreshTokenModel.js', () => ({
  default: {
    hashToken: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
  }
}));

jest.mock('../utils/generateToken.js', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn()
}));

jest.mock('../utils/AppError.js', () => ({
  default: jest.fn((message, code) => {
    const error = new Error(message);
    error.statusCode = code;
    error.isOperational = true;
    return error;
  })
}));

jest.mock('express-async-handler', () => ({
  default: (fn) => fn
}));

jest.mock('../config/roles.js', () => ({
  roles: {
    GLOBAL_SUPER_ADMIN: 'Global Super Admin',
    SCHOOL_ADMIN: 'School Admin',
    TEACHER: 'Teacher',
    STUDENT: 'Student',
    PARENT: 'Parent'
  }
}));

// Now import the controller
import * as userController from './userController.js';
import User from '../models/userModel.js';
import RefreshToken from '../models/refreshTokenModel.js';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken.js';
import AppError from '../utils/AppError.js';

describe('UserController', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup request object
    req = {
      body: {},
      params: {},
      query: {},
      cookies: {},
      user: null
    };
    
    // Setup response object
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    
    // Setup next function
    next = jest.fn();
    
    // Set default environment variables
    process.env.JWT_REFRESH_EXPIRE = '7';
    process.env.NODE_ENV = 'test';
    process.env.JWT_REFRESH_SECRET = 'test-secret';
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      req.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        school: 'school123'
      };

      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123'
      };

      User.findOne.mockResolvedValue(null);
      User.countDocuments.mockResolvedValue(1);
      User.create.mockResolvedValue(mockUser);
      generateAccessToken.mockReturnValue('access-token');
      generateRefreshToken.mockReturnValue('refresh-token');
      RefreshToken.hashToken.mockReturnValue('hashed-token');
      RefreshToken.create.mockResolvedValue({});

      // Act
      await userController.registerUser(req, res, next);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(User.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123',
        accessToken: 'access-token'
      }));
    });

    it('should make the first user a Global Super Admin', async () => {
      // Arrange
      req.body = {
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123'
      };

      const mockAdmin = {
        _id: 'admin123',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'Global Super Admin',
        school: null
      };

      User.findOne.mockResolvedValue(null);
      User.countDocuments.mockResolvedValue(0); // First user
      User.create.mockResolvedValue(mockAdmin);
      generateAccessToken.mockReturnValue('admin-token');
      generateRefreshToken.mockReturnValue('admin-refresh');
      RefreshToken.hashToken.mockReturnValue('hashed-admin');
      RefreshToken.create.mockResolvedValue({});

      // Act
      await userController.registerUser(req, res, next);

      // Assert
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
        role: 'Global Super Admin',
        school: null
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return error if required fields are missing', async () => {
      // Arrange
      req.body = { email: 'test@example.com' }; // Missing name and password

      // Act
      await userController.registerUser(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Name, email, and password are required',
        statusCode: 400
      }));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return error if user already exists', async () => {
      // Arrange
      req.body = {
        name: 'Test User',
        email: 'existing@example.com',
        password: 'password123'
      };

      User.findOne.mockResolvedValue({ email: 'existing@example.com' });

      // Act
      await userController.registerUser(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User with that email already exists',
        statusCode: 409
      }));
    });
  });

  describe('loginUser', () => {
    it('should login user with valid credentials', async () => {
      // Arrange
      req.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123',
        isActive: true,
        matchPassword: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      generateAccessToken.mockReturnValue('access-token');
      generateRefreshToken.mockReturnValue('refresh-token');
      RefreshToken.hashToken.mockReturnValue('hashed-token');
      RefreshToken.create.mockResolvedValue({});

      // Act
      await userController.loginUser(req, res, next);

      // Assert
      expect(mockUser.matchPassword).toHaveBeenCalledWith('password123');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'user123',
        accessToken: 'access-token'
      }));
    });

    it('should return error for invalid credentials', async () => {
      // Arrange
      req.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockUser = {
        matchPassword: jest.fn().mockResolvedValue(false),
        isActive: true
      };

      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Act
      await userController.loginUser(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid credentials',
        statusCode: 401
      }));
    });

    it('should return error if account is deactivated', async () => {
      // Arrange
      req.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        isActive: false,
        matchPassword: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Act
      await userController.loginUser(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Account is deactivated. Please contact support.',
        statusCode: 403
      }));
    });
  });

  describe('logoutUser', () => {
    it('should logout user and clear cookies', async () => {
      // Arrange
      req.cookies = { refreshToken: 'valid-token' };
      RefreshToken.hashToken.mockReturnValue('hashed-token');
      RefreshToken.findOneAndUpdate.mockResolvedValue({});

      // Act
      await userController.logoutUser(req, res, next);

      // Assert
      expect(RefreshToken.findOneAndUpdate).toHaveBeenCalledWith(
        { tokenHash: 'hashed-token' },
        { revoked: true }
      );
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ message: 'User logged out' });
    });

    it('should handle logout without refresh token', async () => {
      // Arrange
      req.cookies = {};

      // Act
      await userController.logoutUser(req, res, next);

      // Assert
      expect(res.clearCookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'User logged out' });
    });
  });

  describe('getMe', () => {
    it('should return current user profile', async () => {
      // Arrange
      req.user = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123',
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      };

      // Act
      await userController.getMe(req, res, next);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        user: expect.objectContaining({
          _id: 'user123',
          name: 'Test User',
          email: 'test@example.com',
          role: 'Student'
        })
      });
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      // Arrange
      req.user = { id: 'user123' };
      req.body = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };

      const mockUser = {
        _id: 'user123',
        name: 'Old Name',
        email: 'old@example.com',
        role: 'Student',
        school: 'school123',
        save: jest.fn().mockResolvedValue({
          _id: 'user123',
          name: 'Updated Name',
          email: 'updated@example.com',
          role: 'Student',
          school: 'school123'
        })
      };

      User.findById.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValue(null); // Email not taken

      // Act
      await userController.updateUserProfile(req, res, next);

      // Assert
      expect(mockUser.name).toBe('Updated Name');
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        user: expect.objectContaining({
          _id: 'user123',
          name: 'Updated Name'
        })
      });
    });

    it('should return error if user not found', async () => {
      // Arrange
      req.user = { id: 'nonexistent' };
      User.findById.mockResolvedValue(null);

      // Act
      await userController.updateUserProfile(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found',
        statusCode: 404
      }));
    });
  });

  describe('getUsers', () => {
    it('should return paginated users list', async () => {
      // Arrange
      req.query = {
        page: '2',
        limit: '10',
        search: 'test'
      };

      const mockUsers = [
        { _id: '1', name: 'Test User 1' },
        { _id: '2', name: 'Test User 2' }
      ];

      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockUsers)
      };

      User.find.mockReturnValue(mockQuery);
      User.countDocuments.mockResolvedValue(25);

      // Act
      await userController.getUsers(req, res);

      // Assert
      expect(User.find).toHaveBeenCalledWith({
        name: { $regex: 'test', $options: 'i' }
      });
      expect(mockQuery.skip).toHaveBeenCalledWith(10); // (page-1) * limit
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(res.json).toHaveBeenCalledWith({
        users: mockUsers,
        page: 2,
        pages: 3,
        total: 25
      });
    });

    it('should handle default pagination parameters', async () => {
      // Arrange
      req.query = {}; // No query params

      const mockUsers = [];
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockUsers)
      };

      User.find.mockReturnValue(mockQuery);
      User.countDocuments.mockResolvedValue(0);

      // Act
      await userController.getUsers(req, res);

      // Assert
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(20); // Default limit
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      // Arrange
      req.params = { id: 'user123' };
      const mockUser = {
        _id: 'user123',
        deleteOne: jest.fn().mockResolvedValue({})
      };

      User.findById.mockResolvedValue(mockUser);

      // Act
      await userController.deleteUser(req, res, next);

      // Assert
      expect(mockUser.deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User removed' });
    });

    it('should return error if user not found', async () => {
      // Arrange
      req.params = { id: 'nonexistent' };
      User.findById.mockResolvedValue(null);

      // Act
      await userController.deleteUser(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found',
        statusCode: 404
      }));
    });
  });
});