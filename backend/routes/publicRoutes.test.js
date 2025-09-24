import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

// Mock models and services before any other imports
jest.unstable_mockModule("../models/Result.js", () => ({
  __esModule: true,
  default: { aggregate: jest.fn() },
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

// Dynamically import modules after mocks are set up
const { default: app, server } = await import("../server.js");
const { default: ShareToken } = await import("../models/ShareToken.js");
const { default: User } = await import("../models/userModel.js"); // Corrected path
const { default: Result } = await import("../models/Result.js");
const { closeSocket } = await import("../config/socket.js");

process.env.JWT_SECRET = "test-secret-for-public-routes";

describe("Public Routes", () => {
  let mongoServer;
  let validToken, expiredToken, unsupportedToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    process.env.MONGO_URI = mongoUri; // Set for the server's connectDB call
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await new Promise(resolve => server.close(resolve));
    closeSocket();
  });

  beforeEach(async () => {
    await ShareToken.deleteMany({});
    Result.aggregate.mockClear();

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    validToken = await ShareToken.create({
      type: "student-analytics",
      targetId: new mongoose.Types.ObjectId(),
      expiresAt: oneHourFromNow,
      school: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
    });

    expiredToken = await ShareToken.create({
      type: "student-analytics",
      targetId: new mongoose.Types.ObjectId(),
      expiresAt: oneHourAgo,
      school: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
    });

    unsupportedToken = await ShareToken.create({
      type: "teacher-analytics", // This type is not supported by the public route
      targetId: new mongoose.Types.ObjectId(),
      expiresAt: oneHourFromNow,
      school: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
    });
  });

  describe("GET /api/public/analytics/:token", () => {
    it("should return student analytics data for a valid token", async () => {
      Result.aggregate.mockResolvedValueOnce([{ _id: "2023/2024", terms: [] }]);
      const res = await request(app).get(`/api/public/analytics/${validToken.token}`);
      expect(res.statusCode).toBe(200);
    });

    it("should return 410 for an expired token", async () => {
      const res = await request(app).get(`/api/public/analytics/${expiredToken.token}`);
      expect(res.statusCode).toBe(410);
    });

    it("should return 400 for an unsupported analytics type", async () => {
      const res = await request(app).get(`/api/public/analytics/${unsupportedToken.token}`);
      expect(res.statusCode).toBe(400);
    });
  });
});
