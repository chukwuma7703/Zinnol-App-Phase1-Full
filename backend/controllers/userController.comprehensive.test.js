import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

// ESM-friendly module mocks using unstable_mockModule + dynamic imports
await jest.unstable_mockModule('../models/userModel.js', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    updateMany: jest.fn(),
  },
}));

await jest.unstable_mockModule('../models/refreshTokenModel.js', () => ({
  __esModule: true,
  default: {
    hashToken: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  },
}));

await jest.unstable_mockModule('../utils/generateToken.js', () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
}));

await jest.unstable_mockModule('../utils/AppError.js', () => ({
  __esModule: true,
  default: jest.fn((message, statusCode = 500) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
  }),
}));

const userController = await import('./userController.js');
const { default: User } = await import('../models/userModel.js');
const { default: RefreshToken } = await import('../models/refreshTokenModel.js');
const { generateAccessToken, generateRefreshToken } = await import('../utils/generateToken.js');
const { default: AppError } = await import('../utils/AppError.js');

describe('User Controller', () => {
  let req, res, next;

  beforeEach(() => {
    // Setup request, response, and next function mocks
    req = {
      body: {},
      params: {},
      query: {},
      cookies: {},
      user: null
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };

    next = jest.fn();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
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

      await userController.registerUser(req, res, next);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(User.create).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'Student',
        school: 'school123'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123',
        accessToken: 'access-token'
      }));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token', expect.any(Object));
    });

    it('should make first user a Global Super Admin', async () => {
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

      generateAccessToken.mockReturnValue('admin-access-token');
      generateRefreshToken.mockReturnValue('admin-refresh-token');
      RefreshToken.hashToken.mockReturnValue('hashed-admin-token');
      RefreshToken.create.mockResolvedValue({});

      await userController.registerUser(req, res, next);

      expect(User.create).toHaveBeenCalledWith({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'Global Super Admin',
        school: null
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return error if required fields are missing', async () => {
      req.body = {
        email: 'test@example.com'
        // Missing name and password
      };

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.registerUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Name, email, and password are required',
        statusCode: 400
      }));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return error if user already exists', async () => {
      req.body = {
        name: 'Test User',
        email: 'existing@example.com',
        password: 'password123'
      };

      User.findOne.mockResolvedValue({ email: 'existing@example.com' });
      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.registerUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User with that email already exists',
        statusCode: 409
      }));
      expect(User.create).not.toHaveBeenCalled();
    });
  });

  describe('loginUser', () => {
    it('should login user successfully with valid credentials', async () => {
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

      await userController.loginUser(req, res, next);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.matchPassword).toHaveBeenCalledWith('password123');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      }));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token', expect.any(Object));
    });

    it('should return error for invalid credentials', async () => {
      req.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockUser = {
        matchPassword: jest.fn().mockResolvedValue(false)
      };

      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.loginUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid credentials',
        statusCode: 401
      }));
    });

    it('should return error if account is deactivated', async () => {
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

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.loginUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Account is deactivated. Please contact support.',
        statusCode: 403
      }));
    });

    it('should return error if email or password is missing', async () => {
      req.body = {
        email: 'test@example.com'
        // Missing password
      };

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.loginUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Please provide email and password',
        statusCode: 400
      }));
      expect(User.findOne).not.toHaveBeenCalled();
    });
  });

  describe('logoutUser', () => {
    it('should logout user and clear refresh token', async () => {
      req.cookies = {
        refreshToken: 'valid-refresh-token'
      };

      RefreshToken.hashToken.mockReturnValue('hashed-token');
      RefreshToken.findOneAndUpdate.mockResolvedValue({});

      await userController.logoutUser(req, res, next);

      expect(RefreshToken.findOneAndUpdate).toHaveBeenCalledWith(
        { tokenHash: 'hashed-token' },
        { revoked: true }
      );
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ message: 'User logged out' });
    });

    it('should handle logout even without refresh token', async () => {
      req.cookies = {};

      await userController.logoutUser(req, res, next);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ message: 'User logged out' });
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token successfully', async () => {
      req.cookies = {
        refreshToken: 'valid-refresh-token'
      };

      const mockDecoded = {
        id: 'user123',
        tokenVersion: 1
      };

      const mockUser = {
        _id: 'user123',
        tokenVersion: 1,
        isActive: true,
        role: 'Student'
      };

      const mockStoredToken = {
        revoked: false,
        expiresAt: new Date(Date.now() + 86400000), // Tomorrow
        save: jest.fn()
      };

      jwt.verify = jest.fn().mockReturnValue(mockDecoded);
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      RefreshToken.hashToken.mockReturnValue('hashed-token');
      RefreshToken.findOne.mockResolvedValue(mockStoredToken);
      RefreshToken.create.mockResolvedValue({});
      generateAccessToken.mockReturnValue('new-access-token');
      generateRefreshToken.mockReturnValue('new-refresh-token');

      await userController.refreshToken(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-refresh-token', process.env.JWT_REFRESH_SECRET);
      expect(mockStoredToken.save).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'new-refresh-token', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ accessToken: 'new-access-token' });
    });

    it('should return error if no refresh token provided', async () => {
      req.cookies = {};

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.refreshToken(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized, no refresh token',
        statusCode: 401
      }));
    });

    it('should return error for invalid refresh token', async () => {
      req.cookies = {
        refreshToken: 'invalid-token'
      };

      jwt.verify = jest.fn().mockImplementation(() => {
        throw new Error('Invalid token');
      });

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.refreshToken(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid or expired refresh token.',
        statusCode: 401
      }));
    });
  });

  describe('getMe', () => {
    it('should return current user profile', async () => {
      req.user = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student',
        school: 'school123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await userController.getMe(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        user: expect.objectContaining({
          _id: 'user123',
          name: 'Test User',
          email: 'test@example.com',
          role: 'Student',
          school: 'school123',
          isActive: true
        })
      });
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
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

      await userController.updateUserProfile(req, res, next);

      expect(mockUser.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        user: expect.objectContaining({
          _id: 'user123',
          name: 'Updated Name',
          email: 'updated@example.com'
        })
      });
    });

    it('should return error if email is already taken', async () => {
      req.user = { id: 'user123' };
      req.body = {
        email: 'taken@example.com'
      };

      const mockUser = {
        _id: 'user123',
        email: 'old@example.com'
      };

      User.findById.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValue({ _id: 'other-user', email: 'taken@example.com' });

      AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

      await userController.updateUserProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Email already in use',
        statusCode: 409
      }));
    });

    it('should update password if provided', async () => {
      req.user = { id: 'user123' };
      req.body = {
        password: 'newpassword123'
      };

      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'oldpassword',
        save: jest.fn().mockResolvedValue({
          _id: 'user123',
          name: 'Test User',
          email: 'test@example.com',
          role: 'Student',
          school: 'school123'
        })
      };

      User.findById.mockResolvedValue(mockUser);

      await userController.updateUserProfile(req, res, next);

      expect(mockUser.password).toBe('newpassword123');
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('Admin Functions', () => {
    describe('getUsers', () => {
      it('should return paginated users list', async () => {
        req.query = {
          page: '2',
          limit: '10',
          search: 'test'
        };

        const mockUsers = [
          { _id: '1', name: 'Test User 1' },
          { _id: '2', name: 'Test User 2' }
        ];

        User.find.mockReturnValue({
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue(mockUsers)
        });
        User.countDocuments.mockResolvedValue(25);

        await userController.getUsers(req, res);

        expect(User.find).toHaveBeenCalledWith({
          name: { $regex: 'test', $options: 'i' }
        });
        expect(res.json).toHaveBeenCalledWith({
          users: mockUsers,
          page: 2,
          pages: 3,
          total: 25
        });
      });
    });

    describe('updateUserRole', () => {
      it('should update user role successfully', async () => {
        req.params = { id: 'user123' };
        req.body = { role: 'Teacher' };
        // Simulate an admin performing the action
        req.user = { _id: 'admin1', role: 'GLOBAL_SUPER_ADMIN' };

        const mockUser = {
          _id: 'user123',
          role: 'Student',
          save: jest.fn().mockResolvedValue({
            _id: 'user123',
            role: 'Teacher'
          })
        };

        User.findById.mockResolvedValue(mockUser);

        await userController.updateUserRole(req, res, next);

        expect(mockUser.role).toBe('Teacher');
        expect(mockUser.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
          message: 'User role updated successfully',
          user: expect.any(Object)
        });
      });

      it('should return error for invalid role', async () => {
        req.params = { id: 'user123' };
        req.body = { role: 'InvalidRole' };

        AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

        await userController.updateUserRole(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
          message: "A valid 'role' is required in the request body.",
          statusCode: 400
        }));
      });
    });

    describe('updateUserStatus', () => {
      it('should activate/deactivate user successfully', async () => {
        req.params = { id: 'user123' };
        req.body = { active: false };
        req.user = {
          _id: 'admin123',
          role: 'Global Super Admin'
        };

        const mockUser = {
          _id: 'user123',
          isActive: true,
          save: jest.fn().mockResolvedValue({
            _id: 'user123',
            isActive: false
          })
        };

        User.findById.mockResolvedValue(mockUser);

        await userController.updateUserStatus(req, res, next);

        expect(mockUser.isActive).toBe(false);
        expect(mockUser.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
          message: 'User status updated successfully',
          user: expect.any(Object)
        });
      });

      it('should prevent user from deactivating own account', async () => {
        req.params = { id: 'admin123' };
        req.body = { active: false };
        req.user = {
          _id: 'admin123',
          role: 'Global Super Admin'
        };

        const mockUser = {
          _id: 'admin123',
          isActive: true
        };

        User.findById.mockResolvedValue(mockUser);
        AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

        await userController.updateUserStatus(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
          message: 'You cannot deactivate your own account.',
          statusCode: 400
        }));
      });
    });

    describe('deleteUser', () => {
      it('should delete user successfully', async () => {
        req.params = { id: 'user123' };

        const mockUser = {
          _id: 'user123',
          deleteOne: jest.fn().mockResolvedValue({})
        };

        User.findById.mockResolvedValue(mockUser);

        await userController.deleteUser(req, res, next);

        expect(mockUser.deleteOne).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User removed' });
      });

      it('should return error if user not found', async () => {
        req.params = { id: 'nonexistent' };

        User.findById.mockResolvedValue(null);
        AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

        await userController.deleteUser(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
          message: 'User not found',
          statusCode: 404
        }));
      });
    });

    describe('adminResetPassword', () => {
      it('should reset user password and invalidate tokens', async () => {
        req.params = { id: 'user123' };
        req.body = { newPassword: 'newSecurePassword123' };

        const mockUser = {
          _id: 'user123',
          password: 'oldPassword',
          tokenVersion: 1,
          save: jest.fn().mockResolvedValue({})
        };

        User.findById.mockReturnValue({
          select: jest.fn().mockResolvedValue(mockUser)
        });

        await userController.adminResetPassword(req, res, next);

        expect(mockUser.password).toBe('newSecurePassword123');
        expect(mockUser.tokenVersion).toBe(2);
        expect(mockUser.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ message: 'Password reset successfully' });
      });

      it('should return error if new password not provided', async () => {
        req.params = { id: 'user123' };
        req.body = {};

        AppError.mockImplementation((message, code) => ({ message, statusCode: code }));

        await userController.adminResetPassword(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
          message: 'New password is required',
          statusCode: 400
        }));
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      req.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      };

      User.findOne.mockRejectedValue(new Error('Database connection error'));

      await userController.registerUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle unexpected errors in async operations', async () => {
      req.cookies = {
        refreshToken: 'valid-token'
      };

      RefreshToken.hashToken.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await userController.logoutUser(req, res, next);

      // Should still clear cookie and respond even if token revocation fails
      expect(res.clearCookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'User logged out' });
    });
  });
});