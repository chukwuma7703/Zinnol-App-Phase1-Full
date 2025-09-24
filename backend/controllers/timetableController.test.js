import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import errorHandler from "../middleware/errorMiddleware.js";

// Mock the cache functions
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();

jest.unstable_mockModule("../config/cache.js", () => ({
  __esModule: true,
  getCache: mockGetCache,
  setCache: mockSetCache
}));

// Mock the Timetable model
const mockTimetable = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
};

jest.unstable_mockModule("../models/timetableModel.js", () => ({
  __esModule: true,
  default: mockTimetable,
}));

// Import the controller after mocking
const timetableModule = await import("../controllers/timetableController.js");
const { createTimetableEntry, getTimetable, deleteTimetableEntry } = timetableModule;

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
      role: "SUPER_ADMIN",
      school: "507f1f77bcf86cd799439012"
    };
    next();
  });

  // Set up routes
  app.post("/api/timetables", createTimetableEntry);
  app.get("/api/timetables", getTimetable);
  app.delete("/api/timetables/:id", deleteTimetableEntry);

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

describe("Timetable Controller", () => {
  describe("createTimetableEntry", () => {
    it("should create a new timetable entry successfully", async () => {
      const mockEntry = {
        _id: "507f1f77bcf86cd799439013",
        school: "507f1f77bcf86cd799439012",
        classroom: "507f1f77bcf86cd799439014",
        subject: "507f1f77bcf86cd799439015",
        teacher: "507f1f77bcf86cd799439016",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00"
      };

      mockTimetable.create.mockResolvedValue(mockEntry);

      const res = await request(app)
        .post("/api/timetables")
        .send({
          school: "507f1f77bcf86cd799439012",
          classroom: "507f1f77bcf86cd799439014",
          subject: "507f1f77bcf86cd799439015",
          teacher: "507f1f77bcf86cd799439016",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockEntry);
      expect(mockTimetable.create).toHaveBeenCalledWith({
        school: "507f1f77bcf86cd799439012",
        classroom: "507f1f77bcf86cd799439014",
        subject: "507f1f77bcf86cd799439015",
        teacher: "507f1f77bcf86cd799439016",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00"
      });
    });

    it("should return 403 when creating for different school", async () => {
      const res = await request(app)
        .post("/api/timetables")
        .send({
          school: "507f1f77bcf86cd799439017", // Different school
          classroom: "507f1f77bcf86cd799439014",
          subject: "507f1f77bcf86cd799439015",
          teacher: "507f1f77bcf86cd799439016",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("message", "Forbidden: You can only create timetables for your own school.");
    });
  });

  describe("getTimetable", () => {
    it("should return timetable from database", async () => {
      const mockTimetableData = [
        {
          _id: "507f1f77bcf86cd799439013",
          school: "507f1f77bcf86cd799439012",
          classroom: { label: "Class A" },
          subject: { name: "Math" },
          teacher: { name: "John Doe" },
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00"
        }
      ];

      mockTimetable.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              sort: jest.fn().mockResolvedValue(mockTimetableData)
            })
          })
        })
      });

      const res = await request(app)
        .get("/api/timetables?classroomId=507f1f77bcf86cd799439014");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockTimetableData);
      expect(mockTimetable.find).toHaveBeenCalledWith({
        school: "507f1f77bcf86cd799439012",
        classroom: "507f1f77bcf86cd799439014"
      });
    });
  });

  describe("deleteTimetableEntry", () => {
    it("should delete timetable entry successfully", async () => {
      const mockEntry = {
        _id: "507f1f77bcf86cd799439013",
        school: "507f1f77bcf86cd799439012",
        classroom: "507f1f77bcf86cd799439014",
        deleteOne: jest.fn().mockResolvedValue()
      };

      mockTimetable.findById.mockResolvedValue(mockEntry);

      const res = await request(app)
        .delete("/api/timetables/507f1f77bcf86cd799439013");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Timetable entry deleted successfully.");
      expect(mockEntry.deleteOne).toHaveBeenCalled();
    });

    it("should return 404 for non-existent entry", async () => {
      mockTimetable.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete("/api/timetables/507f1f77bcf86cd799439013");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("message", "Timetable entry not found.");
    });

    it("should return 403 when deleting entry for different school", async () => {
      const mockEntry = {
        _id: "507f1f77bcf86cd799439013",
        school: "507f1f77bcf86cd799439017", // Different school
        classroom: "507f1f77bcf86cd799439014"
      };

      mockTimetable.findById.mockResolvedValue(mockEntry);

      const res = await request(app)
        .delete("/api/timetables/507f1f77bcf86cd799439013");

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("message", "Forbidden: You cannot delete entries for another school.");
    });
  });
});
