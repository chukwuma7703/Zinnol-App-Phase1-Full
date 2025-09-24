import { jest, describe, it, expect, beforeAll } from "@jest/globals";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken, generateTokens, generateMfaToken, verifyToken } from "./generateToken.js";

describe("Token Generation Utilities", () => {
  const mockUser = {
    _id: "user123",
    role: "teacher",
    tokenVersion: 0,
  };

  beforeAll(() => {
    process.env.JWT_SECRET = "test-access-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  });

  describe("generateAccessToken", () => {
    it("should generate a valid access token with the correct payload", () => {
      const token = generateAccessToken(mockUser);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.tokenVersion).toBe(mockUser.tokenVersion);
      expect(decoded.exp).toBeDefined();
    });

    it("should use custom expiration time when provided", () => {
      const customExpiresIn = "30m";
      const token = generateAccessToken(mockUser, customExpiresIn);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded.id).toBe(mockUser._id);
      // Check that expiration is approximately 30 minutes from now
      const expectedExp = Math.floor(Date.now() / 1000) + (30 * 60);
      expect(decoded.exp).toBeGreaterThan(expectedExp - 10); // Allow 10 second tolerance
      expect(decoded.exp).toBeLessThan(expectedExp + 10);
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid refresh token with the correct payload", () => {
      const token = generateRefreshToken(mockUser);
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.tokenVersion).toBe(mockUser.tokenVersion);
      expect(decoded.exp).toBeDefined();
      expect(decoded.jti).toBeDefined(); // jwtid should be present
    });

    it("should generate unique tokens even when called multiple times quickly", () => {
      const token1 = generateRefreshToken(mockUser);
      const token2 = generateRefreshToken(mockUser);

      expect(token1).not.toBe(token2);

      const decoded1 = jwt.verify(token1, process.env.JWT_REFRESH_SECRET);
      const decoded2 = jwt.verify(token2, process.env.JWT_REFRESH_SECRET);

      expect(decoded1.jti).not.toBe(decoded2.jti); // jwtid should be unique
    });
  });

  describe("generateMfaToken", () => {
    it("should generate a valid MFA token with the correct payload", () => {
      const token = generateMfaToken(mockUser);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.mfa).toBe(true);
      expect(decoded.exp).toBeDefined();
    });

    it("should have a short expiration time (5 minutes)", () => {
      const token = generateMfaToken(mockUser);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check that expiration is approximately 5 minutes from now
      const expectedExp = Math.floor(Date.now() / 1000) + (5 * 60);
      expect(decoded.exp).toBeGreaterThan(expectedExp - 10); // Allow 10 second tolerance
      expect(decoded.exp).toBeLessThan(expectedExp + 10);
    });
  });

  describe("verifyToken", () => {
    it("should verify and decode a valid token", () => {
      const token = generateAccessToken(mockUser);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.tokenVersion).toBe(mockUser.tokenVersion);
    });

    it("should use custom secret when provided", () => {
      const customSecret = "custom-secret";
      const token = jwt.sign({ test: "data" }, customSecret);
      const decoded = verifyToken(token, customSecret);

      expect(decoded.test).toBe("data");
    });

    it("should throw an error for invalid token", () => {
      expect(() => {
        verifyToken("invalid-token");
      }).toThrow("Invalid or expired token");
    });

    it("should throw an error for expired token", () => {
      const expiredToken = jwt.sign(
        { test: "data" },
        process.env.JWT_SECRET,
        { expiresIn: "-1h" } // Already expired
      );

      expect(() => {
        verifyToken(expiredToken);
      }).toThrow("Invalid or expired token");
    });
  });

  describe("generateTokens", () => {
    it("should generate both an access and a refresh token", () => {
      const tokens = generateTokens(mockUser);

      expect(tokens).toHaveProperty("accessToken");
      expect(tokens).toHaveProperty("refreshToken");

      // Verify the access token
      const decodedAccess = jwt.verify(tokens.accessToken, process.env.JWT_SECRET);
      expect(decodedAccess.id).toBe(mockUser._id);

      // Verify the refresh token
      const decodedRefresh = jwt.verify(tokens.refreshToken, process.env.JWT_REFRESH_SECRET);
      expect(decodedRefresh.id).toBe(mockUser._id);
    });

    it("should use custom expiration times when provided", () => {
      const customAccessExpires = "30m";
      const customRefreshExpires = "14d";
      const tokens = generateTokens(mockUser, customAccessExpires, customRefreshExpires);

      expect(tokens).toHaveProperty("accessToken");
      expect(tokens).toHaveProperty("refreshToken");

      // Verify custom access token expiration
      const decodedAccess = jwt.verify(tokens.accessToken, process.env.JWT_SECRET);
      const expectedAccessExp = Math.floor(Date.now() / 1000) + (30 * 60);
      expect(decodedAccess.exp).toBeGreaterThan(expectedAccessExp - 10);

      // Verify custom refresh token expiration
      const decodedRefresh = jwt.verify(tokens.refreshToken, process.env.JWT_REFRESH_SECRET);
      const expectedRefreshExp = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60);
      expect(decodedRefresh.exp).toBeGreaterThan(expectedRefreshExp - 10);
    });
  });
});

