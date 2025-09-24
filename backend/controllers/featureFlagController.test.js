import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import { getAllFeatureFlags, toggleFeatureFlag } from "../controllers/featureFlagController.js";
import FeatureFlag from "../models/FeatureFlag.js";
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

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = {
      _id: "507f1f77bcf86cd799439011",
      role: "GLOBAL_SUPER_ADMIN",
      school: null
    };
    next();
  });

  // Set up routes
  app.get("/api/features", getAllFeatureFlags);
  app.patch("/api/features/:name/toggle", toggleFeatureFlag);

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

describe("Feature Flag Controller", () => {
  describe("getAllFeatureFlags", () => {
    it("should return all feature flags sorted by name", async () => {
      const mockFeatures = [
        {
          _id: "507f1f77bcf86cd799439011",
          name: "analytics-dashboard",
          isEnabled: true,
          isCore: false,
          description: "Analytics dashboard feature"
        },
        {
          _id: "507f1f77bcf86cd799439012",
          name: "user-management",
          isEnabled: false,
          isCore: true,
          description: "User management system"
        }
      ];

      FeatureFlag.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockFeatures)
      });

      const res = await request(app)
        .get("/api/features");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty("name", "analytics-dashboard");
      expect(res.body[1]).toHaveProperty("name", "user-management");
      expect(FeatureFlag.find).toHaveBeenCalledWith({});
    });
  });

  describe("toggleFeatureFlag", () => {
    it("should toggle a feature flag successfully", async () => {
      const mockFeature = {
        _id: "507f1f77bcf86cd799439013",
        name: "test-feature",
        isEnabled: false,
        isCore: false,
        description: "Test feature",
        save: jest.fn().mockResolvedValue({
          _id: "507f1f77bcf86cd799439013",
          name: "test-feature",
          isEnabled: true,
          isCore: false,
          description: "Test feature"
        })
      };

      FeatureFlag.findOne = jest.fn().mockResolvedValue(mockFeature);

      // Mock the cache clearing function
      const mockClearCache = jest.fn();
      jest.doMock('../middleware/featureFlagMiddleware.js', () => ({
        clearFeatureFlagCache: mockClearCache
      }));

      const res = await request(app)
        .patch("/api/features/test-feature/toggle");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Feature 'test-feature' has been enabled.");
      expect(res.body).toHaveProperty("feature");
      expect(res.body.feature.isEnabled).toBe(true);
      expect(mockFeature.save).toHaveBeenCalled();
      expect(FeatureFlag.findOne).toHaveBeenCalledWith({ name: "test-feature" });
    });

    it("should return 404 for non-existent feature", async () => {
      FeatureFlag.findOne = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/features/non-existent-feature/toggle");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("message", "Feature not found.");
    });

    it("should return 400 when trying to disable a core feature", async () => {
      const mockCoreFeature = {
        _id: "507f1f77bcf86cd799439014",
        name: "core-feature",
        isEnabled: true,
        isCore: true,
        description: "Core system feature"
      };

      FeatureFlag.findOne = jest.fn().mockResolvedValue(mockCoreFeature);

      const res = await request(app)
        .patch("/api/features/core-feature/toggle");

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message", "This is a core system feature and cannot be disabled.");
    });

    it("should allow disabling non-core features", async () => {
      const mockFeature = {
        _id: "507f1f77bcf86cd799439015",
        name: "non-core-feature",
        isEnabled: true,
        isCore: false,
        description: "Non-core feature",
        save: jest.fn().mockResolvedValue({
          _id: "507f1f77bcf86cd799439015",
          name: "non-core-feature",
          isEnabled: false,
          isCore: false,
          description: "Non-core feature"
        })
      };

      FeatureFlag.findOne = jest.fn().mockResolvedValue(mockFeature);

      const res = await request(app)
        .patch("/api/features/non-core-feature/toggle");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Feature 'non-core-feature' has been disabled.");
      expect(res.body.feature.isEnabled).toBe(false);
    });
  });
});
