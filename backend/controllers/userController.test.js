import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/userModel.js';
import { roles } from '../config/roles.js';
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshToken,
  getMe,
  updateUserProfile,
  createUser,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  adminResetPassword,
  setupMfa,
  verifyMfa,
  disableMfa,
  regenerateRecoveryCodes,
  verifyLoginMfa,
  googleLogin,
  getUserProfile,
  getDashboardUsers,
  forgotPassword,
  resetPassword
} from './userController.js';
import errorHandler from '../middleware/errorMiddleware.js';

let mongoServer;
let app;
let testUser;
let adminUser;
let accessToken;
let adminAccessToken;

beforeAll(async () => {
  // Set up test environment variables
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-testing-purposes-only';
  process.env.JWT_EXPIRE = '1h';
  process.env.JWT_REFRESH_EXPIRE = '7d';
  process.env.NODE_ENV = 'test';

  // Disconnect if already connected to avoid multiple connection errors
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Set up Express app for testing
  app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Mock auth middleware for protected routes
  const mockAuth = async (req, res, next) => {
    // For testing, we'll decode the JWT to get the user
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        req.user = user;
      } catch (error) {
        req.user = testUser; // Default to testUser on error
      }
    } else {
      req.user = testUser; // Default to testUser if no auth header
    }
    next();
  };

  // Mock protect middleware
  const mockProtect = (req, res, next) => {
    mockAuth(req, res, next);
  };

  // Mock authorizeRoles middleware
  const mockAuthorizeRoles = (allowedRoles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Not authorized for this action' });
      }
      next();
    };
  };

  // Public routes
  app.post('/api/users/register', registerUser);
  app.post('/api/users/login', loginUser);
  app.post('/api/users/forgot-password', forgotPassword);
  // Align with controller: resetPassword is POST /api/users/reset-password (no token param)
  app.post('/api/users/reset-password', resetPassword);
  app.post('/api/users/login/mfa', verifyLoginMfa);
  app.post('/api/users/google-login', googleLogin);

  // Auth routes
  app.post('/api/users/logout', logoutUser);
  app.post('/api/users/refresh', refreshToken);

  // Protected routes
  app.get('/api/users/me', mockProtect, getMe);

  // MFA routes
  app.post('/api/users/mfa/setup', mockProtect, setupMfa);
  app.post('/api/users/mfa/verify', mockProtect, verifyMfa);
  app.post('/api/users/mfa/disable', mockProtect, disableMfa);
  app.post('/api/users/mfa/recovery-codes', mockProtect, regenerateRecoveryCodes);

  // Profile routes
  app.get('/api/users/profile', mockProtect, getUserProfile);
  app.put('/api/users/profile', mockProtect, updateUserProfile);

  // Dashboard
  app.get('/api/users/dashboard', mockProtect, getDashboardUsers);

  // Admin routes
  app.post('/api/users', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), createUser);
  app.get('/api/users', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), getUsers);
  app.get('/api/users/:id', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), getUserById);
  app.delete('/api/users/:id', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN]), deleteUser);
  app.patch('/api/users/:id/role', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), updateUserRole);
  app.patch('/api/users/:id/status', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), updateUserStatus);
  app.patch('/api/users/:id/reset-password', mockProtect, mockAuthorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), adminResetPassword);

  // Error handling
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear database before each test
  await User.deleteMany({});

  // Recreate test users for authenticated tests
  testUser = await User.create({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: roles.STUDENT,
    school: new mongoose.Types.ObjectId(),
    isActive: true
  });

  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'password123',
    role: roles.GLOBAL_SUPER_ADMIN,
    isActive: true
  });

  // Login to get access tokens
  const testUserLogin = await request(app)
    .post('/api/users/login')
    .send({ email: 'test@example.com', password: 'password123' });

  accessToken = testUserLogin.body.accessToken;

  const adminUserLogin = await request(app)
    .post('/api/users/login')
    .send({ email: 'admin@example.com', password: 'password123' });

  adminAccessToken = adminUserLogin.body.accessToken;
});

describe('User Controller', () => {
  describe('POST /api/users/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'password123',
        school: new mongoose.Types.ObjectId().toString()
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe(userData.name);
      expect(response.body.email).toBe(userData.email);
      expect(response.body.role).toBe(roles.STUDENT);
      expect(response.body).toHaveProperty('accessToken');

      // Verify user was created in database
      const user = await User.findOne({ email: userData.email });
      expect(user).toBeTruthy();
      expect(user.role).toBe(roles.STUDENT);
    });

    it('should make first user a GLOBAL_SUPER_ADMIN', async () => {
      // Clear all users first
      await User.deleteMany({});

      const userData = {
        name: 'First User',
        email: 'first@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData)
        .expect(201);

      expect(response.body.role).toBe(roles.GLOBAL_SUPER_ADMIN);
      expect(response.body.school).toBeNull();

      const user = await User.findOne({ email: userData.email });
      expect(user.role).toBe(roles.GLOBAL_SUPER_ADMIN);
      expect(user.school).toBeNull();
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/users/register')
        .send({ name: 'Test User' })
        .expect(400);

      expect(response.body.message).toBe('Name, email, and password are required');
    });

    it('should return 409 if user already exists', async () => {
      const userData = {
        name: 'Existing User',
        email: 'test@example.com', // Already exists
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users/register')
        .send(userData)
        .expect(409);

      expect(response.body.message).toBe('User with that email already exists');
    });
  });

  describe('POST /api/users/login', () => {
    it('should login user successfully', async () => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe('Test User');
      expect(response.body.email).toBe('test@example.com');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should return 400 if email or password missing', async () => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.message).toBe('Please provide email and password');
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 403 for deactivated account', async () => {
      // Deactivate the test user
      await User.findByIdAndUpdate(testUser._id, { isActive: false });

      const response = await request(app)
        .post('/api/users/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(403);

      expect(response.body.message).toBe('Account is deactivated. Please contact support.');

      // Reactivate for other tests
      await User.findByIdAndUpdate(testUser._id, { isActive: true });
    });
  });

  describe('POST /api/users/logout', () => {
    it('should logout user successfully', async () => {
      const response = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('User logged out');
    });
  });

  describe('POST /api/users/refresh', () => {
    it('should refresh access token successfully', async () => {
      // First login to get refresh token
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      const response = await request(app)
        .post('/api/users/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('should return 401 without refresh token', async () => {
      const response = await request(app)
        .post('/api/users/refresh')
        .expect(401);

      expect(response.body.message).toBe('Not authorized, no refresh token');
    });
  });

  describe('GET /api/users/me', () => {
    it('should get current user profile', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user._id).toBeDefined();
      expect(response.body.user.name).toBe('Test User');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.role).toBe(roles.STUDENT);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.user.name).toBe(updateData.name);
      expect(response.body.user.email).toBe(updateData.email);
    });

    it('should return 409 if email already in use', async () => {
      const updateData = {
        email: 'admin@example.com' // Already exists
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(409);

      expect(response.body.message).toBe('Email already in use');
    });
  });

  describe('POST /api/users', () => {
    it('should create user as admin', async () => {
      const userData = {
        name: 'Created by Admin',
        email: 'created@example.com',
        password: 'password123',
        role: roles.TEACHER,
        school: new mongoose.Types.ObjectId().toString()
      };

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(userData)
        .expect(201);

      expect(response.body.name).toBe(userData.name);
      expect(response.body.email).toBe(userData.email);
      expect(response.body.role).toBe(userData.role);
    });

    it('should return 409 if user already exists', async () => {
      const userData = {
        name: 'Duplicate User',
        email: 'test@example.com', // Already exists
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(userData)
        .expect(409);

      expect(response.body.message).toBe('User already exists');
    });
  });

  describe('GET /api/users', () => {
    it('should get all users with pagination', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('pages');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should support search functionality', async () => {
      const response = await request(app)
        .get('/api/users?search=Test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.users.length).toBeGreaterThan(0);
      expect(response.body.users[0].name).toContain('Test');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get user by ID', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body._id).toBe(testUser._id.toString());
      expect(response.body.name).toBe('Test User');
      expect(response.body.email).toBe('test@example.com');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body.message).toBe('User not found');
    });
  });

  describe('PATCH /api/users/:id/role', () => {
    it('should update user role as admin', async () => {
      const response = await request(app)
        .patch(`/api/users/${testUser._id}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: roles.TEACHER })
        .expect(200);

      expect(response.body.message).toBe('User role updated successfully');
      expect(response.body.user.role).toBe(roles.TEACHER);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.role).toBe(roles.TEACHER);
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .patch(`/api/users/${testUser._id}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'INVALID_ROLE' })
        .expect(400);

      expect(response.body.message).toBe("A valid 'role' is required in the request body.");
    });
  });

  describe('PATCH /api/users/:id/status', () => {
    it('should update user status as admin', async () => {
      const response = await request(app)
        .patch(`/api/users/${testUser._id}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ active: false })
        .expect(200);

      expect(response.body.message).toBe('User status updated successfully');
      expect(response.body.user.isActive).toBe(false);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.isActive).toBe(false);

      // Reset status for other tests
      await User.findByIdAndUpdate(testUser._id, { isActive: true });
    });

    it('should return 400 for invalid active value', async () => {
      const response = await request(app)
        .patch(`/api/users/${testUser._id}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ active: 'not_boolean' })
        .expect(400);

      expect(response.body.message).toBe("The 'active' field must be a boolean (true or false).");
    });

    it('should prevent deactivating own account', async () => {
      const response = await request(app)
        .patch(`/api/users/${adminUser._id}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ active: false })
        .expect(400);

      expect(response.body.message).toBe('You cannot deactivate your own account.');
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete user as admin', async () => {
      // Create a user to delete
      const userToDelete = await User.create({
        name: 'User to Delete',
        email: 'delete@example.com',
        password: 'password123',
        role: roles.STUDENT
      });

      const response = await request(app)
        .delete(`/api/users/${userToDelete._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.message).toBe('User removed');

      // Verify user was deleted
      const deletedUser = await User.findById(userToDelete._id);
      expect(deletedUser).toBeNull();
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body.message).toBe('User not found');
    });
  });

  describe('PATCH /api/users/:id/reset-password', () => {
    it('should reset user password as admin', async () => {
      const newPassword = 'newpassword123';

      const response = await request(app)
        .patch(`/api/users/${testUser._id}/reset-password`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ newPassword })
        .expect(200);

      expect(response.body.message).toBe('Password reset successfully');

      // Verify password was changed
      const updatedUser = await User.findById(testUser._id).select('+password');
      expect(await updatedUser.matchPassword(newPassword)).toBe(true);
    });

    it('should return 400 if new password not provided', async () => {
      const response = await request(app)
        .patch(`/api/users/${testUser._id}/reset-password`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({})
        .expect(400);

      expect(response.body.message).toBe('New password is required');
    });
  });

  describe('MFA Functions (Not Implemented)', () => {
    it('should return setup message for MFA setup', async () => {
      const response = await request(app)
        .post('/api/users/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('MFA setup not implemented yet');
    });

    it('should return verify message for MFA verify', async () => {
      const response = await request(app)
        .post('/api/users/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('MFA verification not implemented yet');
    });

    it('should return disable message for MFA disable', async () => {
      const response = await request(app)
        .post('/api/users/mfa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('MFA disable not implemented yet');
    });

    it('should return recovery codes message', async () => {
      const response = await request(app)
        .post('/api/users/mfa/recovery-codes')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('Recovery codes regeneration not implemented yet');
    });

    it('should return login MFA message', async () => {
      const response = await request(app)
        .post('/api/users/login/mfa')
        .expect(200);

      expect(response.body.message).toBe('Login MFA verification not implemented yet');
    });
  });

  describe('Google Login (Not Implemented)', () => {
    it('should return google login message', async () => {
      const response = await request(app)
        .post('/api/users/google-login')
        .expect(200);

      expect(response.body.message).toBe('Google login not implemented yet');
    });
  });

  describe('GET /api/users/profile', () => {
    it('should get user profile', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body._id).toBe(testUser._id.toString());
      expect(response.body.name).toBe('Test User');
      expect(response.body.email).toBe('test@example.com');
    });
  });

  describe('GET /api/users/dashboard', () => {
    it('should get dashboard users', async () => {
      const response = await request(app)
        .get('/api/users/dashboard')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('role');
    });
  });

  describe('Password Reset Functions (Not Implemented)', () => {
    it('should return forgot password message', async () => {
      const response = await request(app)
        .post('/api/users/forgot-password')
        .expect(200);

      expect(response.body.message).toBe('Forgot password not implemented yet');
    });

    it('should return reset password message', async () => {
      const response = await request(app)
        .post('/api/users/reset-password')
        .expect(200);

      expect(response.body.message).toBe('Reset password not implemented yet');
    });
  });
});
