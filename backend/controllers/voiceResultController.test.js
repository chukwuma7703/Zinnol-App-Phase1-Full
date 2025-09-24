import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import { voiceResultEntry } from "../controllers/voiceResultController.js";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
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

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = {
      _id: "507f1f77bcf86cd799439011",
      role: "TEACHER",
      school: "507f1f77bcf86cd799439012"
    };
    next();
  });

  // Set up routes
  app.post("/api/voice-results", voiceResultEntry);

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

describe("Voice Result Controller", () => {
  describe("voiceResultEntry", () => {
    it("should create a result entry with fuzzy matching", async () => {
      const mockStudents = [
        {
          _id: "507f1f77bcf86cd799439013",
          firstName: "John",
          lastName: "Doe",
          school: "507f1f77bcf86cd799439012"
        },
        {
          _id: "507f1f77bcf86cd799439014",
          firstName: "Jane",
          lastName: "Smith",
          school: "507f1f77bcf86cd799439012"
        }
      ];

      const mockSubjects = [
        {
          _id: "507f1f77bcf86cd799439015",
          name: "Mathematics",
          school: "507f1f77bcf86cd799439012"
        },
        {
          _id: "507f1f77bcf86cd799439016",
          name: "English",
          school: "507f1f77bcf86cd799439012"
        }
      ];

      const mockResult = {
        _id: "507f1f77bcf86cd799439017",
        student: "507f1f77bcf86cd799439013",
        subject: "507f1f77bcf86cd799439015",
        score: 85,
        enteredBy: "507f1f77bcf86cd799439011",
        entryMethod: "voice"
      };

      Student.find = jest.fn().mockResolvedValue(mockStudents);
      Subject.find = jest.fn().mockResolvedValue(mockSubjects);
      Result.create = jest.fn().mockResolvedValue(mockResult);

      const res = await request(app)
        .post("/api/voice-results")
        .send({
          student: "john doe",
          subject: "math",
          score: 85
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("message", "Result recorded for John Doe in Mathematics: 85");
      expect(res.body).toHaveProperty("result", mockResult);
      expect(Student.find).toHaveBeenCalledWith({ school: "507f1f77bcf86cd799439012" });
      expect(Subject.find).toHaveBeenCalledWith({ school: "507f1f77bcf86cd799439012" });
      expect(Result.create).toHaveBeenCalledWith({
        student: "507f1f77bcf86cd799439013",
        subject: "507f1f77bcf86cd799439015",
        score: 85,
        enteredBy: "507f1f77bcf86cd799439011",
        entryMethod: "voice"
      });
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/api/voice-results")
        .send({
          student: "john doe",
          // missing subject and score
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message", "Missing student, subject, or score");
    });

    it("should return 404 for student not found", async () => {
      const mockStudents = [
        {
          _id: "507f1f77bcf86cd799439013",
          firstName: "Jane",
          lastName: "Smith",
          school: "507f1f77bcf86cd799439012"
        }
      ];

      Student.find = jest.fn().mockResolvedValue(mockStudents);
      Subject.find = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .post("/api/voice-results")
        .send({
          student: "john doe",
          subject: "math",
          score: 85
        });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("message", "Student not found");
    });

    it("should return 404 for subject not found", async () => {
      const mockStudents = [
        {
          _id: "507f1f77bcf86cd799439013",
          firstName: "John",
          lastName: "Doe",
          school: "507f1f77bcf86cd799439012"
        }
      ];

      const mockSubjects = [
        {
          _id: "507f1f77bcf86cd799439015",
          name: "English",
          school: "507f1f77bcf86cd799439012"
        }
      ];

      Student.find = jest.fn().mockResolvedValue(mockStudents);
      Subject.find = jest.fn().mockResolvedValue(mockSubjects);

      const res = await request(app)
        .post("/api/voice-results")
        .send({
          student: "john doe",
          subject: "math",
          score: 85
        });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("message", "Subject not found");
    });
  });
});
