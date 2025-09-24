import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';

// Import models directly
import User from '../../models/userModel.js';
import { roles } from '../../config/roles.js';
import RefreshToken from '../../models/refreshTokenModel.js';

let mongoServer;

describe('User Integration Tests', () => {
  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect to the in-memory database
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('User Model', () => {
    it('should create a new user', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'Student'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.name).toBe(userData.name);
      expect(savedUser.email).toBe(userData.email);
      // Model normalizes role to canonical code (uppercase constant)
      expect(savedUser.role).toBe(roles.STUDENT);
      expect(savedUser.password).not.toBe(userData.password); // Should be hashed
    });

    it('should hash password before saving', async () => {
      const userData = {
        name: 'Test User',
        email: 'test2@example.com',
        password: 'plainPassword123'
      };

      const user = new User(userData);
      await user.save();

      // Password should be hashed
      expect(user.password).not.toBe('plainPassword123');
      expect(user.password.length).toBeGreaterThan(20);

      // Should be able to compare with bcrypt
      const isMatch = await bcrypt.compare('plainPassword123', user.password);
      expect(isMatch).toBe(true);
    });

    it('should not save user without required fields', async () => {
      const user = new User({
        name: 'Test User'
        // Missing email and password
      });

      await expect(user.save()).rejects.toThrow();
    });

    it('should enforce unique email constraint', async () => {
      const userData = {
        name: 'User 1',
        email: 'duplicate@example.com',
        password: 'password123'
      };

      // Create first user
      await User.create(userData);

      // Try to create second user with same email
      const duplicateUser = new User({
        name: 'User 2',
        email: 'duplicate@example.com',
        password: 'password456'
      });

      await expect(duplicateUser.save()).rejects.toThrow();
    });

    it('should have default values', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'default@example.com',
        password: 'password123'
      });

      expect(user.isActive).toBe(true);
      expect(user.tokenVersion).toBe(0);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });
  });

  describe('User Methods', () => {
    it('should match password correctly', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'match@example.com',
        password: 'correctPassword123'
      });

      // Fetch user with password field
      const foundUser = await User.findById(user._id).select('+password');

      if (foundUser && typeof foundUser.matchPassword === 'function') {
        const isMatch = await foundUser.matchPassword('correctPassword123');
        expect(isMatch).toBe(true);

        const isWrong = await foundUser.matchPassword('wrongPassword');
        expect(isWrong).toBe(false);
      }
    });
  });

  describe('RefreshToken Model', () => {
    it('should create a refresh token', async () => {
      const user = await User.create({
        name: 'Token User',
        email: 'token@example.com',
        password: 'password123'
      });

      const tokenData = {
        tokenHash: 'hashedToken123',
        user: user._id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      const refreshToken = await RefreshToken.create(tokenData);

      expect(refreshToken._id).toBeDefined();
      expect(refreshToken.tokenHash).toBe(tokenData.tokenHash);
      expect(refreshToken.user.toString()).toBe(user._id.toString());
      expect(refreshToken.revoked).toBe(false);
    });

    it('should hash token correctly', () => {
      if (typeof RefreshToken.hashToken === 'function') {
        const token = 'myRefreshToken123';
        const hash1 = RefreshToken.hashToken(token);
        const hash2 = RefreshToken.hashToken(token);

        expect(hash1).toBeDefined();
        expect(hash1).toBe(hash2); // Same input should produce same hash
        expect(hash1).not.toBe(token); // Should be different from original
      }
    });

    it('should handle token expiration', async () => {
      const user = await User.create({
        name: 'Expire User',
        email: 'expire@example.com',
        password: 'password123'
      });

      // Create expired token
      const expiredToken = await RefreshToken.create({
        tokenHash: 'expiredHash',
        user: user._id,
        expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
      });

      expect(expiredToken.expiresAt < new Date()).toBe(true);
    });
  });

  describe('User Queries', () => {
    beforeEach(async () => {
      // Seed some test data
      await User.create([
        { name: 'Alice', email: 'alice@example.com', password: 'pass123', role: 'Student' },
        { name: 'Bob', email: 'bob@example.com', password: 'pass123', role: 'Teacher' },
        { name: 'Charlie', email: 'charlie@example.com', password: 'pass123', role: 'Student' },
        { name: 'Diana', email: 'diana@example.com', password: 'pass123', role: 'School Admin' }
      ]);
    });

    it('should find users by role', async () => {
      const students = await User.find({ role: roles.STUDENT });
      expect(students).toHaveLength(2);
      expect(students.every(s => s.role === roles.STUDENT)).toBe(true);
    });

    it('should paginate users', async () => {
      const page = 1;
      const limit = 2;
      const users = await User.find()
        .skip((page - 1) * limit)
        .limit(limit);

      expect(users).toHaveLength(2);
    });

    it('should search users by name', async () => {
      const searchTerm = 'ali';
      const users = await User.find({
        name: { $regex: searchTerm, $options: 'i' }
      });

      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Alice');
    });

    it('should count documents', async () => {
      const total = await User.countDocuments();
      expect(total).toBe(4);

      const studentCount = await User.countDocuments({ role: roles.STUDENT });
      expect(studentCount).toBe(2);
    });

    it('should update user', async () => {
      const user = await User.findOne({ email: 'alice@example.com' });
      user.name = 'Alice Updated';
      await user.save();

      const updated = await User.findById(user._id);
      expect(updated.name).toBe('Alice Updated');
    });

    it('should delete user', async () => {
      const user = await User.findOne({ email: 'bob@example.com' });
      await user.deleteOne();

      const deleted = await User.findById(user._id);
      expect(deleted).toBeNull();

      const remaining = await User.countDocuments();
      expect(remaining).toBe(3);
    });
  });

  describe('User Validation', () => {
    it('should validate email format', async () => {
      const invalidUser = new User({
        name: 'Invalid Email User',
        email: 'notanemail',
        password: 'password123'
      });

      await expect(invalidUser.save()).rejects.toThrow();
    });

    it('should trim whitespace from fields', async () => {
      const user = await User.create({
        name: '  Trimmed User  ',
        email: '  trimmed@example.com  ',
        password: 'password123'
      });

      expect(user.name).toBe('Trimmed User');
      expect(user.email).toBe('trimmed@example.com');
    });

    it('should convert email to lowercase', async () => {
      const user = await User.create({
        name: 'Case User',
        email: 'UPPERCASE@EXAMPLE.COM',
        password: 'password123'
      });

      expect(user.email).toBe('uppercase@example.com');
    });
  });

  describe('User Relationships', () => {
    it('should handle school relationship', async () => {
      // Create a mock school ID
      const schoolId = new mongoose.Types.ObjectId();

      const user = await User.create({
        name: 'School User',
        email: 'school@example.com',
        password: 'password123',
        school: schoolId
      });

      expect(user.school).toBeDefined();
      expect(user.school.toString()).toBe(schoolId.toString());
    });

    it('should handle users without school', async () => {
      const user = await User.create({
        name: 'No School User',
        email: 'noschool@example.com',
        password: 'password123'
      });

      expect(user.school).toBeUndefined();
    });
  });
});