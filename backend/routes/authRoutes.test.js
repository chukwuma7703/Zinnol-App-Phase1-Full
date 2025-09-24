import request from "supertest";
import mongoose from "mongoose";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import School from "../models/School.js";
import User from "../models/userModel.js";
import { closeSocket } from "../config/socket.js";
import { roles } from "../config/roles.js";

// Mock the logger to prevent "no transports" errors during tests
jest.unstable_mockModule("../utils/logger.js", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
    logRequest: jest.fn(),
    logError: jest.fn(),
    stream: { write: jest.fn() },
  },
}));

// Mock background schedulers to prevent them from running during tests
jest.unstable_mockModule("../utils/notificationScheduler.js", () => ({
  __esModule: true,
  startNotificationScheduler: jest.fn(),
}));
jest.unstable_mockModule("../services/weatherUpdater.js", () => ({
  __esModule: true,
  scheduleWeatherUpdates: jest.fn(),
}));

// Mock google-auth-library with a shared verifyIdToken across instances
let sharedVerifyIdToken;
jest.unstable_mockModule("google-auth-library", () => {
  sharedVerifyIdToken = sharedVerifyIdToken || jest.fn();
  return {
    __esModule: true,
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: sharedVerifyIdToken,
    })),
  };
});

// Mock speakeasy for MFA tests
jest.unstable_mockModule("speakeasy", () => ({
  default: {
    generateSecret: jest.fn().mockReturnValue({ base32: "MOCKSECRETINBASE32", otpauth_url: "otpauth://totp/Zinnol?secret=MOCKSECRETINBASE32" }),
    totp: {
      verify: jest.fn(),
    },
  },
}));

// Dynamically import app AFTER mocks and database are set up
let app;
const { OAuth2Client } = await import("google-auth-library");
const { default: speakeasy } = await import("speakeasy");
process.env.JWT_SECRET = "test-secret-for-auth-routes";

// Increase timeout for this test suite due to extensive seeding in beforeEach
jest.setTimeout(30000);

let mongoServer;
let globalAdminToken, mainAdminToken, principalToken, teacherToken, studentToken;
let school1, school2, mainAdminUser, userInSchool1, userInSchool2;
let mockVerifyIdToken;
let mockTotpVerify;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  process.env.MONGO_URI = mongoUri; // Set for the server's connectDB call

  // Create a minimal app for testing instead of importing the full server
  const express = (await import("express")).default;
  app = express();
  app.use(express.json());

  // Import and use the routes
  const userRoutes = (await import("../routes/userRoutes.js")).default;
  const authRoutes = (await import("../routes/authRoutes.js")).default;

  app.use("/api/users", userRoutes);
  app.use("/api/auth", authRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();

  // --- Seed Data ---
  school1 = await School.create({ name: "Zinnol High" });
  school2 = await School.create({ name: "Rival Academy" });

  const globalAdminUser = await User.create({ name: "Global Admin", email: "global@zinnol.com", password: "password123", role: roles.GLOBAL_SUPER_ADMIN });
  mainAdminUser = await User.create({ name: "Main Admin", email: "main@zinnol.com", password: "password123", role: roles.MAIN_SUPER_ADMIN, school: school1._id });
  // Associate the main admin with the school
  school1.mainSuperAdmins.push(mainAdminUser._id);
  await school1.save();

  const principalUser = await User.create({ name: "Principal", email: "principal@zinnol.com", password: "password123", role: roles.PRINCIPAL, school: school1._id });
  const teacherUser = await User.create({ name: "Teacher", email: "teacher@zinnol.com", password: "password123", role: roles.TEACHER, school: school1._id });
  const studentUser = await User.create({ name: "Student User", email: "student.user@zinnol.com", password: "password123", role: roles.STUDENT, school: school1._id });
  await User.create({ name: "Inactive Teacher", email: "inactive.teacher@zinnol.com", password: "password123", role: roles.TEACHER, school: school1._id, isActive: false });

  userInSchool1 = await User.create({ name: "Student One", email: "student1@zinnol.com", password: "password123", role: roles.STUDENT, school: school1._id });
  userInSchool2 = await User.create({ name: "Student Two", email: "student2@rival.com", password: "password123", role: roles.STUDENT, school: school2._id });

  // Generate tokens
  globalAdminToken = jwt.sign({ id: globalAdminUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  mainAdminToken = jwt.sign({ id: mainAdminUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  principalToken = jwt.sign({ id: principalUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  teacherToken = jwt.sign({ id: teacherUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  studentToken = jwt.sign({ id: studentUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);

  // Get a handle to the mock function (instance method created by mock implementation)
  // All instances share the same mock, so capture it directly
  mockVerifyIdToken = sharedVerifyIdToken;
  mockTotpVerify = speakeasy.totp.verify;
  mockTotpVerify.mockClear();
});

describe("User Creation and Auth Routes", () => {
  describe("POST /api/users (Admin User Creation)", () => {
    it("should allow an admin to register a new user successfully", async () => {
      const newUser = { name: "New Student", email: "new@example.com", password: "password123", role: "student", schoolId: school1._id };
      const res = await request(app)
        .post("/api/users") // Correct endpoint for admin-led user creation
        .set("Authorization", `Bearer ${principalToken}`)
        .send(newUser);

      expect(res.statusCode).toBe(201);
      // The register route doesn't return a token, just the created user info
      expect(res.body).not.toHaveProperty("token");
      expect(res.body.email).toBe("new@example.com");
    });

    it("should return 400 if registering with an existing email", async () => {
      const existingUser = { name: "Duplicate", email: "teacher@zinnol.com", password: "password123", role: "teacher" };
      const res = await request(app)
        .post("/api/users") // Correct endpoint for admin-led user creation
        .set("Authorization", `Bearer ${principalToken}`)
        .send(existingUser);
      // This test expects 400 if the email exists, but the route is protected for non-initial registrations.
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("User with this email already exists.");
    });
  });

  describe("POST /api/users/login", () => {
    it("should login successfully with correct credentials", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ email: "teacher@zinnol.com", password: "password123" });

      expect(res.statusCode).toBe(200); // Expect 200 for successful login
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });

    it("should return 401 for incorrect password", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ email: "teacher@zinnol.com", password: "wrongpassword" });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBe("Invalid credentials");
    });
  });

  describe("POST /api/users/google-login", () => {
    it("should login successfully with a valid Google token for an existing user", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: "teacher@zinnol.com" }),
      });

      const res = await request(app)
        .post("/api/users/google-login")
        .send({ token: "valid-google-token" });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body.user.email).toBe("teacher@zinnol.com");
      expect(res.headers["set-cookie"][0]).toContain("refreshToken");
    });

    it("should return 404 if the Google email is not registered", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: "nonexistent@example.com" }),
      });

      const res = await request(app)
        .post("/api/users/google-login")
        .send({ token: "valid-google-token" });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe("Your email is not registered. Please contact an administrator.");
    });

    it("should return 403 if the user account is deactivated", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: "inactive.teacher@zinnol.com" }),
      });

      const res = await request(app)
        .post("/api/users/google-login")
        .send({ token: "valid-google-token-for-inactive-user" });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe("Your account has been deactivated. Please contact support.");
    });

    it("should return 400 if no Google token is provided", async () => {
      const res = await request(app).post("/api/users/google-login").send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Google token is required.");
    });

    it("should return 500 if Google token verification fails", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("Invalid token from Google"));
      const res = await request(app).post("/api/users/google-login").send({ token: "invalid-token" });
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe("Invalid token from Google");
    });
  });

  describe("GET /api/users/profile", () => {
    it("should get the user's profile if authenticated", async () => {
      const res = await request(app)
        .get("/api/users/profile")
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe("teacher@zinnol.com");
    });

    it("should return 401 if not authenticated", async () => {
      const res = await request(app).get("/api/users/profile");
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/users/dashboard", () => {
    it("should allow GLOBAL_SUPER_ADMIN to see all users", async () => {
      const res = await request(app)
        .get("/api/users/dashboard")
        .set("Authorization", `Bearer ${globalAdminToken}`);

      expect(res.statusCode).toBe(200);
      // 4 users created in beforeEach + the global admin themselves
      expect(res.body.users.length).toBeGreaterThanOrEqual(6);
    });

    it("should allow MAIN_SUPER_ADMIN to see only users in their school", async () => {
      const res = await request(app)
        .get("/api/users/dashboard")
        .set("Authorization", `Bearer ${mainAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.users.length).toBe(5); // Main Admin, Principal, Teacher, studentUser, userInSchool1
      expect(res.body.users.every(user => user.school?._id.toString() === school1._id.toString())).toBe(true);
    });

    it("should allow PRINCIPAL to see teachers and students in their school", async () => {
      const res = await request(app)
        .get("/api/users/dashboard")
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      // The principal sees teachers, parents, and students
      expect(res.body.users.length).toBe(3); // teacherUser, studentUser, userInSchool1
    });

    it("should allow a TEACHER to see only their own profile", async () => {
      const res = await request(app)
        .get("/api/users/dashboard")
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].email).toBe("teacher@zinnol.com");
    });
  });

  describe("PUT /api/users/:id/role", () => {
    it("should allow GLOBAL_SUPER_ADMIN to change a user's role", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool1._id}/role`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send({ role: roles.PRINCIPAL });

      expect(res.statusCode).toBe(200);
      expect(res.body.user.role).toBe(roles.PRINCIPAL);
    });

    it("should allow MAIN_SUPER_ADMIN to change a role for a user in their school", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool1._id}/role`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ role: roles.TEACHER });

      expect(res.statusCode).toBe(200);
      expect(res.body.user.role).toBe(roles.TEACHER);
    });

    it("should deny MAIN_SUPER_ADMIN from changing a role for a user in another school", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool2._id}/role`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ role: roles.TEACHER });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe("Cannot modify user outside your school");
    });

    it("should deny a MAIN_SUPER_ADMIN from promoting a user to GLOBAL_SUPER_ADMIN", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool1._id}/role`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ role: roles.GLOBAL_SUPER_ADMIN });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe("Main super admin cannot make global super admins");
    });

    it("should deny a PRINCIPAL from changing a user's role", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool1._id}/role`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send({ role: roles.TEACHER });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain("Forbidden: Access denied.");
    });
  });

  describe("PUT /api/users/:id/status (Activate/Deactivate)", () => {
    it("should allow MAIN_SUPER_ADMIN to deactivate a user in their school", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool1._id}/status`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ active: false });

      expect(res.statusCode).toBe(200); // Expect 200 for successful update
      const updatedUser = await User.findById(userInSchool1._id); // Fetch the user from DB
      expect(updatedUser.isActive).toBe(false);
    });

    it("should cascade deactivation when GLOBAL_SUPER_ADMIN deactivates a MAIN_SUPER_ADMIN", async () => {
      const mainAdminUser = await User.findOne({ email: "main@zinnol.com" });

      const res = await request(app)
        .put(`/api/users/${mainAdminUser._id}/status`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send({ active: false });

      expect(res.statusCode).toBe(200);

      // Check that other users in the same school are now inactive
      const principal = await User.findOne({ email: "principal@zinnol.com" });
      const teacher = await User.findOne({ email: "teacher@zinnol.com" });

      expect(principal.isActive).toBe(false);
      expect(teacher.isActive).toBe(false);
    });

    it("should deny a MAIN_SUPER_ADMIN from deactivating their own account", async () => {
      const res = await request(app)
        .put(`/api/users/${mainAdminUser._id}/status`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ active: false });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("You cannot deactivate your own account.");
    });

    it("should deny a MAIN_SUPER_ADMIN from deactivating a user in another school", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool2._id}/status`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ active: false });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe("Cannot modify user outside your school");
    });

    it("should deny a PRINCIPAL from deactivating a user", async () => {
      const res = await request(app)
        .put(`/api/users/${userInSchool1._id}/status`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send({ active: false });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain("Forbidden: Access denied.");
    });
  });

  describe("MFA Flow with Recovery Codes", () => {
    let mfaUser;
    let mfaUserToken;

    // Helper function to enable MFA for a user and return their plain-text recovery codes
    const enableMfaForUser = async (user, token) => {
      await request(app)
        .post("/api/users/mfa/setup")
        .set("Authorization", `Bearer ${token}`);

      mockTotpVerify.mockReturnValue(true);
      const verifyRes = await request(app)
        .post("/api/users/mfa/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ token: "123456" }); // A valid TOTP code

      return verifyRes.body.recoveryCodes;
    };

    beforeEach(async () => {
      // Create a dedicated user for MFA tests to avoid state pollution
      mfaUser = await User.create({ name: "MFA User", email: "mfa@test.com", password: "password123", role: roles.TEACHER, school: school1._id });
      mfaUserToken = jwt.sign({ id: mfaUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
    });

    it("should generate 10 recovery codes when MFA is enabled", async () => {
      const recoveryCodes = await enableMfaForUser(mfaUser, mfaUserToken);

      expect(recoveryCodes).toBeInstanceOf(Array);
      expect(recoveryCodes.length).toBe(10);

      const userInDb = await User.findById(mfaUser._id).select("+mfaRecoveryCodes");
      expect(userInDb.mfaRecoveryCodes.length).toBe(10);
      // Check that a plain text code is NOT stored in the DB
      const isMatch = await bcrypt.compare(recoveryCodes[0], userInDb.mfaRecoveryCodes[0]);
      expect(isMatch).toBe(true);
    });

    it("should allow login with a valid recovery code when TOTP fails", async () => {
      const recoveryCodes = await enableMfaForUser(mfaUser, mfaUserToken);

      // Step 1: Initial login with password
      const loginRes = await request(app)
        .post("/api/users/login")
        .send({ email: "mfa@test.com", password: "password123" });

      expect(loginRes.body.mfaRequired).toBe(true);
      const mfaToken = loginRes.body.mfaToken;

      // Step 2: Verify with recovery code
      mockTotpVerify.mockReturnValue(false); // Simulate TOTP failure
      const verifyRes = await request(app)
        .post("/api/users/login/verify-mfa")
        .set("Authorization", `Bearer ${mfaToken}`)
        .send({ token: recoveryCodes[0] });

      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body).toHaveProperty("accessToken");
    });

    it("should consume a recovery code after it is used for login", async () => {
      const recoveryCodes = await enableMfaForUser(mfaUser, mfaUserToken);
      const usedCode = recoveryCodes[0];

      const loginRes = await request(app).post("/api/users/login").send({ email: "mfa@test.com", password: "password123" });
      const mfaToken = loginRes.body.mfaToken;

      // Use the code once
      mockTotpVerify.mockReturnValue(false);
      await request(app).post("/api/users/login/verify-mfa").set("Authorization", `Bearer ${mfaToken}`).send({ token: usedCode });

      // Check DB
      const userInDb = await User.findById(mfaUser._id).select("+mfaRecoveryCodes");
      expect(userInDb.mfaRecoveryCodes.length).toBe(9);

      // Try to use it again
      const secondLoginRes = await request(app).post("/api/users/login").send({ email: "mfa@test.com", password: "password123" });
      const secondMfaToken = secondLoginRes.body.mfaToken;
      const secondVerifyRes = await request(app).post("/api/users/login/verify-mfa").set("Authorization", `Bearer ${secondMfaToken}`).send({ token: usedCode });

      expect(secondVerifyRes.statusCode).toBe(401);
      expect(secondVerifyRes.body.message).toBe("Invalid authentication code or recovery code.");
    });

    it("should allow a user to regenerate recovery codes, invalidating the old ones", async () => {
      const oldRecoveryCodes = await enableMfaForUser(mfaUser, mfaUserToken);

      // Mock a valid TOTP code for regeneration
      mockTotpVerify.mockReturnValue(true);
      const regenRes = await request(app)
        .post("/api/users/mfa/regenerate-recovery")
        .set("Authorization", `Bearer ${mfaUserToken}`)
        .send({ password: "password123", token: "123456" });

      expect(regenRes.statusCode).toBe(200);
      const newRecoveryCodes = regenRes.body.recoveryCodes;
      expect(newRecoveryCodes.length).toBe(10);
      expect(newRecoveryCodes[0]).not.toBe(oldRecoveryCodes[0]);

      // Verify old code no longer works
      const loginRes = await request(app).post("/api/users/login").send({ email: "mfa@test.com", password: "password123" });
      const mfaToken = loginRes.body.mfaToken;

      mockTotpVerify.mockReturnValue(false); // Simulate TOTP failure
      const verifyRes = await request(app)
        .post("/api/users/login/verify-mfa")
        .set("Authorization", `Bearer ${mfaToken}`)
        .send({ token: oldRecoveryCodes[0] }); // Use an old code

      expect(verifyRes.statusCode).toBe(401);
    });
  });

  describe("Rate Limiting on Auth Routes", () => {
    it("should block requests to /api/users/login after 10 attempts from the same IP", async () => {
      const loginCredentials = { email: "rate@limit.test", password: "password" };
      const promises = [];

      // Fire off 10 requests. We don't need to wait for each one to finish.
      for (let i = 0; i < 10; i++) {
        promises.push(request(app).post("/api/users/login").send(loginCredentials));
      }
      await Promise.all(promises);

      // The 11th request should be blocked
      const res = await request(app).post("/api/users/login").send(loginCredentials);

      expect(res.statusCode).toBe(429);
      expect(res.body.message).toBe("Too many login attempts from this IP. Please try again after 15 minutes.");

      // Check for standard rate limit headers
      expect(res.headers).toHaveProperty("ratelimit-limit");
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('0');
    });
  });
});
