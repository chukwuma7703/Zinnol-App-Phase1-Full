/**
 * Authentication Integration Tests
 * End-to-end tests for authentication flow
 */

import request from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import User from '../../models/userModel.js';
import { protect } from '../../middleware/authMiddleware.js';
import userRoutes from '../../routes/userRoutes.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

// Protected test route
app.get('/api/protected', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

describe('Authentication Integration Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clean up database
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('Registration Flow', () => {
    it('should register, login, and access protected route', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'Test@1234',
      };

      // 1. Register
      const registerRes = await request(app)
        .post('/api/users/register')
        .send(userData);

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.success).toBe(true);
      expect(registerRes.body.token).toBeDefined();
      expect(registerRes.body.user.email).toBe(userData.email);

      // 2. Login
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.token).toBeDefined();

      const token = loginRes.body.token;

      // 3. Access protected route
      const protectedRes = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(protectedRes.status).toBe(200);
      expect(protectedRes.body.success).toBe(true);
      expect(protectedRes.body.user.email).toBe(userData.email);
    });

    it('should not register duplicate email', async () => {
      const userData = {
        name: 'Test User',
        email: 'duplicate@example.com',
        password: 'Test@1234',
      };

      // First registration
      await request(app)
        .post('/api/users/register')
        .send(userData);

      // Duplicate registration
      const res = await request(app)
        .post('/api/users/register')
        .send(userData);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should validate password requirements', async () => {
      const weakPassword = {
        name: 'Test User',
        email: 'weak@example.com',
        password: '123456', // Weak password
      };

      const res = await request(app)
        .post('/api/users/register')
        .send(weakPassword);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('Login Flow', () => {
    beforeEach(async () => {
      // Create test user
      await User.create({
        name: 'Login Test',
        email: 'login@example.com',
        password: 'Login@1234',
        isActive: true,
      });
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'login@example.com',
          password: 'Login@1234',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
    });

    it('should not login with wrong password', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid');
    });

    it('should track failed login attempts', async () => {
      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/users/login')
          .send({
            email: 'login@example.com',
            password: 'WrongPassword',
          });
      }

      const user = await User.findOne({ email: 'login@example.com' });
      expect(user.failedLoginAttempts).toBe(3);
    });
  });

  describe('Protected Routes', () => {
    let token;

    beforeEach(async () => {
      // Create and login user
      const user = await User.create({
        name: 'Protected Test',
        email: 'protected@example.com',
        password: 'Protected@1234',
        role: 'teacher',
      });

      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: 'protected@example.com',
          password: 'Protected@1234',
        });

      token = loginRes.body.token;
    });

    it('should access protected route with valid token', async () => {
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should not access protected route without token', async () => {
      const res = await request(app)
        .get('/api/protected');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should not access protected route with invalid token', async () => {
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should get current user profile', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('protected@example.com');
    });

    it('should update user profile', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          phone: '+1234567890',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
    });
  });

  describe('Password Reset Flow', () => {
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'Reset Test',
        email: 'reset@example.com',
        password: 'Reset@1234',
      });
    });

    it('should request password reset', async () => {
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: 'reset@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Check that reset token was created
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.passwordResetToken).toBeDefined();
      expect(updatedUser.passwordResetExpires).toBeDefined();
    });

    it('should reset password with valid token', async () => {
      // Create reset token
      const resetToken = user.createPasswordResetToken();
      await user.save();

      const res = await request(app)
        .put(`/api/users/reset-password/${resetToken}`)
        .send({ password: 'NewPassword@1234' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Try logging in with new password
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: 'reset@example.com',
          password: 'NewPassword@1234',
        });

      expect(loginRes.status).toBe(200);
    });

    it('should not reset password with invalid token', async () => {
      const res = await request(app)
        .put('/api/users/reset-password/invalid-token')
        .send({ password: 'NewPassword@1234' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Role-Based Access Control', () => {
    let adminToken, teacherToken, studentToken;

    beforeEach(async () => {
      // Create users with different roles
      const admin = await User.create({
        name: 'Admin',
        email: 'admin@example.com',
        password: 'Admin@1234',
        role: 'super_admin',
      });

      const teacher = await User.create({
        name: 'Teacher',
        email: 'teacher@example.com',
        password: 'Teacher@1234',
        role: 'teacher',
      });

      const student = await User.create({
        name: 'Student',
        email: 'student@example.com',
        password: 'Student@1234',
        role: 'student',
      });

      // Get tokens
      const adminLogin = await request(app)
        .post('/api/users/login')
        .send({ email: 'admin@example.com', password: 'Admin@1234' });
      adminToken = adminLogin.body.token;

      const teacherLogin = await request(app)
        .post('/api/users/login')
        .send({ email: 'teacher@example.com', password: 'Teacher@1234' });
      teacherToken = teacherLogin.body.token;

      const studentLogin = await request(app)
        .post('/api/users/login')
        .send({ email: 'student@example.com', password: 'Student@1234' });
      studentToken = studentLogin.body.token;
    });

    it('should allow admin to access admin routes', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should not allow teacher to access admin routes', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should not allow student to access admin routes', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});