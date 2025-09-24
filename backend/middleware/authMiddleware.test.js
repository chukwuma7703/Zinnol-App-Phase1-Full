import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import jwt from "jsonwebtoken";

// Mock express-async-handler
jest.unstable_mockModule("express-async-handler", () => ({
  default: (fn) => fn
}));

// Mock User model
jest.unstable_mockModule("../models/userModel.js", () => ({
  default: {
    findById: jest.fn()
  }
}));

// Mock AppError
jest.unstable_mockModule("../utils/AppError.js", () => ({
  default: class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'AppError';
    }
  }
}));

// Import after mocking
const { default: AppError } = await import("../utils/AppError.js");
const { default: User } = await import("../models/userModel.js");
const { protect, protectMfa, authorizeRoles, authorizeGlobalAdmin, roles } = await import("./authMiddleware.js");

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      body: {},
      params: {},
      query: {}
    };
    res = {};
    next = jest.fn();
    process.env.JWT_SECRET = 'test-secret';
    process.env.ZINNOL_CEO_EMAIL = 'ceo@zinnol.com';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ZINNOL_CEO_EMAIL;
  });

  describe("protect middleware", () => {
    it("should authenticate valid token and active user", async () => {
      const userId = '507f1f77bcf86cd799439011';
      const token = jwt.sign(
        { id: userId, tokenVersion: 1 },
        process.env.JWT_SECRET
      );

      req.headers.authorization = `Bearer ${token}`;

      const mockUser = {
        _id: userId,
        name: 'Test User',
        email: 'test@example.com',
        role: 'TEACHER',
        isActive: true,
        tokenVersion: 1,
        school: '507f1f77bcf86cd799439012'
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await protect(req, res, next);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledWith();
    });

    it("should reject request without authorization header", async () => {
      await protect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(AppError)
      );
      const error = next.mock.calls[0][0];
      expect(error.message).toBe("Not authorized, no token provided.");
      expect(error.statusCode).toBe(401);
    });
  });
});

