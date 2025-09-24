import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import { getSharedAnalytics } from "../controllers/publicController.js";
import ShareToken from "../models/ShareToken.js";
import Result from "../models/Result.js";
import errorHandler from "../middleware/errorMiddleware.js";

let mongoServer;
let app;

beforeAll(async () => {
  jest.setTimeout(60000);
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Set up Express app for integration tests
  app = express();
  app.use(express.json());

  // Set up routes
  app.get("/api/public/analytics/:token", getSharedAnalytics);

  // Error handling middleware
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Public Controller", () => {
  describe("getSharedAnalytics", () => {
    it("should return student analytics for valid token", async () => {
      const mockShareToken = {
        _id: "507f1f77bcf86cd799439011",
        token: "valid-token-123",
        type: "student-analytics",
        targetId: "507f1f77bcf86cd799439012",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Future date
      };

      const mockPerformanceHistory = [
        {
          _id: "2024/2025",
          terms: [
            { term: 1, average: 85.5, position: 3 },
            { term: 2, average: 88.2, position: 2 }
          ]
        }
      ];

      ShareToken.findOne = jest.fn().mockResolvedValue(mockShareToken);
      Result.aggregate = jest.fn().mockResolvedValue(mockPerformanceHistory);

      const res = await request(app)
        .get("/api/public/analytics/valid-token-123");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Student analytics retrieved successfully.");
      expect(res.body).toHaveProperty("performanceHistory");
      expect(res.body).toHaveProperty("termAnalysis");
      expect(ShareToken.findOne).toHaveBeenCalledWith({ token: "valid-token-123" });
      expect(Result.aggregate).toHaveBeenCalled();
    });

    it("should return 404 for invalid token", async () => {
      ShareToken.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .get("/api/public/analytics/invalid-token");

      expect(res.status).toBe(404);
      expect(ShareToken.findOne).toHaveBeenCalledWith({ token: "invalid-token" });
    });

    it("should return 410 for expired token", async () => {
      const mockExpiredToken = {
        _id: "507f1f77bcf86cd799439013",
        token: "expired-token-123",
        type: "student-analytics",
        targetId: "507f1f77bcf86cd799439014",
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Past date
      };

      ShareToken.findOne = jest.fn().mockResolvedValue(mockExpiredToken);

      const res = await request(app)
        .get("/api/public/analytics/expired-token-123");

      expect(res.status).toBe(410);
      expect(res.body).toHaveProperty("message", "This share link has expired.");
    });

    it("should return 400 for unsupported analytics type", async () => {
      const mockUnsupportedToken = {
        _id: "507f1f77bcf86cd799439015",
        token: "unsupported-token-123",
        type: "unsupported-type",
        targetId: "507f1f77bcf86cd799439016",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      ShareToken.findOne = jest.fn().mockResolvedValue(mockUnsupportedToken);

      const res = await request(app)
        .get("/api/public/analytics/unsupported-token-123");

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message", "Unsupported analytics type for this share link.");
    });
  });
});
