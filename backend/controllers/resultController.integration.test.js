import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import path from "path";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import School from "../models/School.js";
import User from "../models/userModel.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Student from "../models/Student.js";
import Result from "../models/Result.js";
import AnnualResult from "../models/AnnualResult.js";
import { closeSocket } from "../config/socket.js";
import { roles } from "../config/roles.js";

// Mock the queue to prevent Redis connection errors in tests
jest.unstable_mockModule("../queues/resultQueue.js", () => ({
  annualResultQueue: { add: jest.fn() },
}));

// Mock the feature flag to always be enabled for these tests
jest.unstable_mockModule("../models/FeatureFlag.js", () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue({ isEnabled: true }) },
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

// Dynamically import app and other modules AFTER mocks are set up
const { default: app, server } = await import("../server.js");
const fs = (await import("fs/promises")).default;

process.env.JWT_SECRET = "test-secret-for-results";

let mongoServer;
let principalToken, teacherToken, parentToken;
let school, classroom, student1, student2, subject1;
let pendingResult, approvedResult;

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
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  school = await School.create({ name: "Test School" });

  const teacherUser = await User.create({ name: "Teacher", email: "teacher@test.com", password: "password", role: roles.TEACHER, school: school._id });
  classroom = await Classroom.create({ school: school._id, stage: "jss", level: 1, section: "A", teacher: teacherUser._id });
  subject1 = await Subject.create({ name: "Mathematics", code: "MTH", school: school._id });

  student1 = await Student.create({ school: school._id, classroom: classroom._id, admissionNumber: "S001", firstName: "Alice", lastName: "A", gender: "Female" });
  student2 = await Student.create({ school: school._id, classroom: classroom._id, admissionNumber: "S002", firstName: "Bob", lastName: "B", gender: "Male" });

  const principalUser = await User.create({ name: "Principal", email: "principal@test.com", password: "password", role: roles.PRINCIPAL, school: school._id });
  const parentUser = await User.create({ name: "Parent", email: "parent@test.com", password: "password", role: roles.PARENT, school: school._id, studentProfile: student1._id });

  principalToken = jwt.sign({ id: principalUser._id, tokenVersion: principalUser.tokenVersion }, process.env.JWT_SECRET);
  teacherToken = jwt.sign({ id: teacherUser._id, tokenVersion: teacherUser.tokenVersion }, process.env.JWT_SECRET);
  parentToken = jwt.sign({ id: parentUser._id, tokenVersion: parentUser.tokenVersion }, process.env.JWT_SECRET);

  pendingResult = await Result.create({
    school: school._id,
    classroom: classroom._id,
    student: student1._id,
    session: "2023/2024",
    term: 1,
    items: [{ subject: subject1._id, caScore: 30, examScore: 50 }], // total 80
    status: "pending",
    submittedBy: teacherUser._id,
  });

  approvedResult = await Result.create({
    school: school._id,
    classroom: classroom._id,
    student: student2._id,
    session: "2023/2024",
    term: 1,
    items: [{ subject: subject1._id, caScore: 35, examScore: 55 }], // total 90
    status: "approved",
    submittedBy: teacherUser._id,
    approvedBy: principalUser._id,
  });
});

describe("Result Controller", () => {
  describe("POST /api/results (submitResult)", () => {
    it("should allow a teacher to submit a new result", async () => {
      const newResultData = {
        school: school._id,
        classroom: classroom._id,
        student: student2._id,
        session: "2023/2024",
        term: 2,
        items: [{ subject: subject1._id, caScore: 25, examScore: 45 }],
      };
      const res = await request(app)
        .post("/api/results")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(newResultData);

      expect(res.statusCode).toBe(201);
      expect(res.body.result.status).toBe("pending");
      expect(res.body.result.totalScore).toBe(70);
    });

    it("should fail if student is not in the provided classroom", async () => {
      const otherClassroom = await Classroom.create({ school: school._id, stage: "jss", level: 2, section: "A", teacher: new mongoose.Types.ObjectId() });
      const newResultData = {
        school: school._id,
        classroom: otherClassroom._id,
        student: student1._id,
        session: "2023/2024",
        term: 2,
        items: [{ subject: subject1._id, caScore: 25, examScore: 45 }],
      };
      const res = await request(app)
        .post("/api/results")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(newResultData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Student is not in the provided classroom");
    });
  });

  describe("PATCH /api/results/:id/approve (approveResult)", () => {
    it("should allow a principal to approve a pending result and recompute positions", async () => {
      const res = await request(app)
        .patch(`/api/results/${pendingResult._id}/approve`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.result.status).toBe("approved");

      const result1 = await Result.findById(pendingResult._id);
      const result2 = await Result.findById(approvedResult._id);
      expect(result2.position).toBe(1); // 90 score
      expect(result1.position).toBe(2); // 80 score
    });

    it("should deny a teacher from approving a result", async () => {
      const res = await request(app)
        .patch(`/api/results/${pendingResult._id}/approve`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /api/results/:id/reject (rejectResult)", () => {
    it("should allow a principal to reject a pending result with a reason", async () => {
      const res = await request(app)
        .patch(`/api/results/${pendingResult._id}/reject`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send({ reason: "Calculation error." });

      expect(res.statusCode).toBe(200);
      expect(res.body.result.status).toBe("rejected");
      expect(res.body.result.rejectionReason).toBe("Calculation error.");
    });
  });

  describe("GET /api/results/student/:studentId (getStudentResults)", () => {
    it("should allow a parent to view only approved results for their child", async () => {
      await Result.findByIdAndUpdate(pendingResult._id, { status: "approved" });
      const res = await request(app)
        .get(`/api/results/student/${student1._id}`)
        .set("Authorization", `Bearer ${parentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe("approved");
    });

    it("should allow a teacher to view all results (pending and approved) for a student", async () => {
      const res = await request(app)
        .get(`/api/results/student/${student1._id}`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe("pending");
    });
  });

  describe("POST /api/results/generate-annual/:classroomId/:session", () => {
    it("should correctly queue a job for annual result generation", async () => {
      await Result.findByIdAndUpdate(pendingResult._id, { status: "approved" });

      const res = await request(app)
        .post(`/api/results/generate-annual/${classroom._id}/2023/2024`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(202); // The controller returns 202 Accepted for a background job
      expect(res.body.message).toContain("Annual result generation has been scheduled");
      // We cannot assert on the DB result here because it's handled by a separate worker process.
      // We can only assert that the job was queued successfully.
    });
  });

  describe("Voice Note Routes", () => {
    const uploadsDir = path.join(process.cwd(), "uploads", "voice-notes");
    const testVoiceNotePath = path.join(uploadsDir, "test-voice-note.mp3");

    beforeAll(async () => {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(testVoiceNotePath, "fake audio data");
    });

    it("POST /api/results/:resultId/voice-note - should allow a teacher to upload a voice note", async () => {
      const res = await request(app)
        .post(`/api/results/${pendingResult._id}/voice-note`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .attach("voiceNote", testVoiceNotePath);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.voiceNoteUrl).toBeDefined();
      const result = await Result.findById(pendingResult._id);
      expect(result.teacherVoiceNoteUrl).toBe(res.body.data.voiceNoteUrl);
    });

    it("DELETE /api/results/:resultId/voice-note - should allow deleting a voice note if result is pending", async () => {
      const uploadRes = await request(app)
        .post(`/api/results/${pendingResult._id}/voice-note`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .attach("voiceNote", testVoiceNotePath);

      const deleteRes = await request(app)
        .delete(`/api/results/${pendingResult._id}/voice-note`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(deleteRes.statusCode).toBe(200);
      const result = await Result.findById(pendingResult._id);
      expect(result.teacherVoiceNoteUrl).toBeUndefined();
    });
  });
});
