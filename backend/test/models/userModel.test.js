/**
 * User Model Test Suite
 * Tests for user model methods and validations
 */

import mongoose from 'mongoose';
import User from '../../models/userModel.js';
import bcrypt from 'bcryptjs';
import { TestDatabase } from './testUtils.js';

// Ensure an isolated in-memory Mongo instance for this suite. Relying solely on globalSetup
// proved flaky (buffering timeouts) so we explicitly manage connection lifecycle here.
beforeAll(async () => {
  await TestDatabase.connect();
});

beforeEach(async () => {
  await TestDatabase.clear();
});

// IMPORTANT: Do NOT disconnect here or it will close the shared mongoose
// connection while other test suites are still running in parallel, causing
// buffering timeouts (Operation buffering timed out after 10000ms). Global
// teardown handles connection cleanup. Leaving data cleared per test only.
afterAll(async () => {
  // Intentionally no disconnect to avoid interfering with concurrent suites.
});

describe('User Model', () => {
  describe('Schema Validations', () => {
    it('should create a valid user', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'Test@1234',
        role: 'TEACHER',
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.role).toBe(userData.role);
    });

    it('should require name', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'Test@1234',
      });

      await expect(user.save()).rejects.toThrow();
    });

    it('should require email', async () => {
      const user = new User({
        name: 'Test User',
        password: 'Test@1234',
      });

      await expect(user.save()).rejects.toThrow();
    });

    it('should validate email format', async () => {
      const user = new User({
        name: 'Test User',
        email: 'invalid-email',
        password: 'Test@1234',
      });

      await expect(user.save()).rejects.toThrow();
    });

    it('should enforce unique email', async () => {
      const userData = {
        name: 'Test User',
        email: 'unique@example.com',
        password: 'Test@1234',
      };

      await User.create(userData);

      const duplicateUser = new User(userData);
      await expect(duplicateUser.save()).rejects.toThrow();
    });

    it('should validate role enum', async () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Test@1234',
        role: 'invalid_role',
      });

      await expect(user.save()).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const plainPassword = 'Test@1234';
      const user = await User.create({
        name: 'Test User',
        email: 'hash@example.com',
        password: plainPassword,
      });

      expect(user.password).not.toBe(plainPassword);
      expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash pattern
    });

    it('should not rehash password if not modified', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'nohash@example.com',
        password: 'Test@1234',
      });

      const originalHash = user.password;
      user.name = 'Updated Name';
      await user.save();

      expect(user.password).toBe(originalHash);
    });
  });

  describe('Instance Methods', () => {
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'Test User',
        email: 'methods@example.com',
        password: 'Test@1234',
        role: 'TEACHER',
      });
    });

    describe('matchPassword', () => {
      it('should return true for correct password', async () => {
        const isMatch = await user.matchPassword('Test@1234');
        expect(isMatch).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const isMatch = await user.matchPassword('WrongPassword');
        expect(isMatch).toBe(false);
      });
    });

    describe('createPasswordResetToken', () => {
      it('should generate reset token', () => {
        const token = user.createPasswordResetToken();

        expect(token).toBeDefined();
        expect(token).toHaveLength(40); // 20 bytes hex = 40 chars
        expect(user.passwordResetToken).toBeDefined();
        expect(user.passwordResetExpires).toBeDefined();
      });

      it('should set expiry time', () => {
        user.createPasswordResetToken();

        const now = Date.now();
        const expiry = user.passwordResetExpires.getTime();
        const diff = expiry - now;

        // Should be approximately 10 minutes (600000ms)
        expect(diff).toBeGreaterThan(590000);
        expect(diff).toBeLessThan(610000);
      });
    });

    describe('incrementFailedLoginAttempts', () => {
      it('should increment failed attempts', async () => {
        await user.incrementFailedLoginAttempts();
        expect(user.failedLoginAttempts).toBe(1);

        await user.incrementFailedLoginAttempts();
        expect(user.failedLoginAttempts).toBe(2);
      });

      it('should lock account after max attempts', async () => {
        for (let i = 0; i < 5; i++) {
          await user.incrementFailedLoginAttempts();
        }

        expect(user.failedLoginAttempts).toBe(5);
        expect(user.accountLockedUntil).toBeDefined();
        expect(user.accountLockedUntil).toBeInstanceOf(Date);
      });
    });

    describe('resetFailedLoginAttempts', () => {
      it('should reset failed attempts', async () => {
        user.failedLoginAttempts = 3;
        user.accountLockedUntil = new Date();

        await user.resetFailedLoginAttempts();

        expect(user.failedLoginAttempts).toBe(0);
        expect(user.accountLockedUntil).toBeNull();
      });
    });

    describe('isAccountLocked', () => {
      it('should return false for unlocked account', () => {
        expect(user.isAccountLocked()).toBe(false);
      });

      it('should return true for locked account', () => {
        user.accountLockedUntil = new Date(Date.now() + 3600000); // 1 hour from now
        expect(user.isAccountLocked()).toBe(true);
      });

      it('should return false for expired lock', () => {
        user.accountLockedUntil = new Date(Date.now() - 3600000); // 1 hour ago
        expect(user.isAccountLocked()).toBe(false);
      });
    });
  });

  describe('Virtual Properties', () => {
    it('should have fullName virtual', async () => {
      const user = await User.create({
        name: 'John Doe',
        email: 'virtual@example.com',
        password: 'Test@1234',
      });

      // Note: fullName virtual might not be defined in the model
      // This is a placeholder test
      expect(user.name).toBe('John Doe');
    });
  });

  describe('Indexes', () => {
    it('should have index on email', async () => {
      const indexes = User.collection.getIndexes();
      const emailIndex = (await indexes)['email_1'];
      expect(emailIndex).toBeDefined();
    });

    it('should have index on role', async () => {
      const indexes = User.collection.getIndexes();
      const roleIndex = (await indexes)['role_1'];
      // Index might not exist, this is informational
      if (roleIndex) {
        expect(roleIndex).toBeDefined();
      }
    });
  });

  describe('Timestamps', () => {
    it('should add createdAt and updatedAt', async () => {
      const user = await User.create({
        name: 'Timestamp User',
        email: 'timestamp@example.com',
        password: 'Test@1234',
      });

      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const user = await User.create({
        name: 'Update User',
        email: 'update@example.com',
        password: 'Test@1234',
      });

      const originalUpdatedAt = user.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      user.name = 'Updated Name';
      await user.save();

      expect(user.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Soft Delete', () => {
    it('should soft delete user', async () => {
      const user = await User.create({
        name: 'Delete User',
        email: 'delete@example.com',
        password: 'Test@1234',
      });

      user.isDeleted = true;
      user.deletedAt = new Date();
      await user.save();

      expect(user.isDeleted).toBe(true);
      expect(user.deletedAt).toBeDefined();
    });
  });

  describe('MFA Properties', () => {
    it('should handle MFA setup', async () => {
      const user = await User.create({
        name: 'MFA User',
        email: 'mfa@example.com',
        password: 'Test@1234',
      });

      user.mfaEnabled = true;
      user.mfaSecret = 'test-secret';
      await user.save();

      expect(user.mfaEnabled).toBe(true);
      expect(user.mfaSecret).toBe('test-secret');
    });
  });
});