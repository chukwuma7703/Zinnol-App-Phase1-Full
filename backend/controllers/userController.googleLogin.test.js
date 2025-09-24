import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import errorHandler from "../middleware/errorMiddleware.js";

// --- Mocks Setup ---

// Mock the google-auth-library. We only need to mock the parts we use.
const mockVerifyIdToken = jest.fn();
class MockOAuth2Client {
  constructor() { }
  verifyIdToken(...args) {
    return mockVerifyIdToken(...args);
  }
}
jest.unstable_mockModule("google-auth-library", () => ({
  __esModule: true,
  OAuth2Client: MockOAuth2Client,
}));

// Mock the User model to simulate database interactions
const mockUserFindOne = jest.fn();
const mockUserInstance = {
  _id: "user123",
  name: "Google User",
  email: "google.user@example.com",
  role: "STUDENT",
  isActive: true,
  tokenVersion: 0,
  isVerified: true,
  school: { _id: "school123", name: "Google High" },
  save: jest.fn().mockResolvedValue(true),
};
jest.unstable_mockModule("../models/userModel.js", () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
  },
}));

// Mock token generation utilities
jest.unstable_mockModule("../utils/generateToken.js", () => ({
  __esModule: true,
  generateAccessToken: jest.fn().mockReturnValue('fake-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('fake-refresh-token'),
  generateMfaToken: jest.fn().mockReturnValue('fake-mfa-token'), // Add missing mock
}));

// Mock refresh token model to avoid DB operations
const mockHashToken = jest.fn().mockReturnValue('hashed-refresh');
const mockCreate = jest.fn().mockResolvedValue({});
jest.unstable_mockModule("../models/refreshTokenModel.js", () => ({
  __esModule: true,
  default: {
    hashToken: mockHashToken,
    create: mockCreate,
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  },
}));

// --- Dynamic Imports (must happen after mocks) ---
const userController = await import("./userController.js");

// --- Test Application Setup ---
// Create a minimal Express app to test the controller in isolation
const app = express();
app.use(express.json());
app.post("/api/users/google-login", userController.googleLogin);
app.use(errorHandler); // Use the actual error handler to test error responses
const request = supertest(app);

describe("googleLogin Controller Unit Tests", () => {
  beforeEach(() => {
    // Clear all mock implementations and call history before each test
    jest.clearAllMocks();
    mockUserInstance.save.mockClear();
  });

  it("should login successfully for an existing, active user", async () => {
    // Arrange: Mock a successful Google token verification and a successful user lookup.
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "google.user@example.com" }),
    });
    mockUserFindOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(mockUserInstance),
    });

    // Act: Make the request to the controller.
    const res = await request
      .post("/api/users/google-login")
      .send({ token: "valid-google-token" });

    // Assert: Check for the correct status, response body, and side effects.
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("fake-access-token");
    expect(res.body.user.email).toBe("google.user@example.com");
    expect(res.headers['set-cookie'][0]).toContain("refreshToken=fake-refresh-token");
    expect(mockUserInstance.save).toHaveBeenCalled(); // Verifies that lastActivity was updated
  });

  it("should return 404 if the user's email is not registered", async () => {
    // Arrange: Mock a successful verification but a failed user lookup.
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "unregistered.user@example.com" }),
    });
    mockUserFindOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(null), // User not found
    });

    // Act
    const res = await request
      .post("/api/users/google-login")
      .send({ token: "valid-token-for-unregistered-user" });

    // Assert
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Your email is not registered. Please contact an administrator.");
  });

  it("should return 403 if the user's account is deactivated", async () => {
    // Arrange: Mock finding a user who is marked as inactive.
    const inactiveUser = { ...mockUserInstance, isActive: false };
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "google.user@example.com" }),
    });
    mockUserFindOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(inactiveUser),
    });

    // Act
    const res = await request
      .post("/api/users/google-login")
      .send({ token: "valid-token-for-inactive-user" });

    // Assert
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Your account has been deactivated. Please contact support.");
  });

  it("should return 500 if Google token verification fails", async () => {
    // Arrange: Mock the Google library throwing an error.
    const verificationError = new Error("Invalid token from Google");
    mockVerifyIdToken.mockRejectedValue(verificationError);

    // Act
    const res = await request
      .post("/api/users/google-login")
      .send({ token: "invalid-google-token" });

    // Assert: The controller's try/catch block should handle this and return a 500.
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Invalid token from Google");
  });
});
