import { jest, describe, beforeAll, afterAll, beforeEach, expect } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import User from "./userModel.js";




// Mock the Date.now() to have predictable timestamps for lockout tests
const MOCK_DATE_NOW = 1672531200000; // Jan 1, 2023 00:00:00 UTC

describe("User Model Methods", () => {
  // Increase timeout for this test suite to allow for MongoDB download
  jest.setTimeout(180000); // 180 seconds (3 minutes)
  
  let mongoServer;

  // Before all tests, create and connect to an in-memory MongoDB server
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    // Mock Date.now() for consistent test results
    jest.spyOn(Date, "now").mockImplementation(() => MOCK_DATE_NOW);
  });

  // After all tests, disconnect and stop the server
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    jest.restoreAllMocks(); // Restore original Date.now()
  });

  // Before each test, clear the User collection to ensure test isolation
  beforeEach(async () => {
    await User.deleteMany({});
  });

  // A baseline user object for creating test users
  const userData = {
    name: "Test User",
    email: "test@example.com",
    password: "password123",
  };

  describe("incLoginAttempts method", () => {
    it("should increment loginAttempts by 1 on each call", async () => {
      let user = await User.create(userData);
      expect(user.loginAttempts).toBe(0);

      await user.incLoginAttempts();
      user = await User.findById(user._id); // Re-fetch to get the updated document

      expect(user.loginAttempts).toBe(1);
    });

    it("should lock the account after 5 failed attempts", async () => {
      let user = await User.create(userData);

      for (let i = 0; i < 5; i++) {
        await user.incLoginAttempts();
        user = await User.findById(user._id); // Re-fetch in loop to simulate separate requests
      }

      expect(user.loginAttempts).toBe(0); // Resets to 0 after lock
      expect(user.lockUntil).not.toBeNull();
      expect(user.lockoutCount).toBe(1);
      // First lockout: 30 * 2^(1-1) = 30 minutes
      const expectedLockTime = new Date(MOCK_DATE_NOW + 30 * 60 * 1000);
      expect(user.lockUntil.getTime()).toBe(expectedLockTime.getTime());
    });

    it("should apply exponential backoff for subsequent lockouts", async () => {
      // Start with a user who has already been locked out once
      let user = await User.create({ ...userData, lockoutCount: 1 });

      for (let i = 0; i < 5; i++) {
        await user.incLoginAttempts();
        user = await User.findById(user._id);
      }

      expect(user.lockoutCount).toBe(2);
      // Second lockout: 30 * 2^(2-1) = 60 minutes
      const expectedLockTime = new Date(MOCK_DATE_NOW + 60 * 60 * 1000);
      expect(user.lockUntil.getTime()).toBe(expectedLockTime.getTime());
    });

    it("should do nothing if the account is already locked", async () => {
      const lockTime = new Date(MOCK_DATE_NOW + 10 * 60 * 1000); // Locked for 10 more mins
      let user = await User.create({ ...userData, loginAttempts: 4, lockUntil: lockTime });

      await user.incLoginAttempts();
      user = await User.findById(user._id);

      expect(user.loginAttempts).toBe(4); // Should not change
      expect(user.lockUntil.getTime()).toBe(lockTime.getTime()); // Should not change
    });
  });

  describe("resetLoginAttempts method", () => {
    it("should reset loginAttempts, lockUntil, and lockoutCount to their defaults", async () => {
      const lockTime = new Date(MOCK_DATE_NOW + 10 * 60 * 1000);
      let user = await User.create({ ...userData, loginAttempts: 3, lockUntil: lockTime, lockoutCount: 1 });

      await user.resetLoginAttempts();
      user = await User.findById(user._id);

      expect(user.loginAttempts).toBe(0);
      expect(user.lockUntil).toBeNull();
      expect(user.lockoutCount).toBe(0);
    });
  });

  describe("invalidateTokens method", () => {
    it("should increment tokenVersion by 1", async () => {
      let user = await User.create({ ...userData, tokenVersion: 5 });
      expect(user.tokenVersion).toBe(5);

      await user.invalidateTokens();
      user = await User.findById(user._id);

      expect(user.tokenVersion).toBe(6);
    });
  });
});

