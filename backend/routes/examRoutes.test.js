import supertest from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

// Models
import School from "../models/School.js";
import User from "../models/userModel.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Exam from "../models/Exam.js";
import { roles } from "../middleware/authMiddleware.js"; // Use authMiddleware for consistency

// --- Mock socket.io ---
jest.unstable_mockModule("../config/socket.js", () => ({
  __esModule: true,
  initSocket: jest.fn(),
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
  closeSocket: jest.fn(),
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

// Import app AFTER mocks
const { default: app, server } = await import("../server.js");
const { closeSocket } = await import("../config/socket.js");

process.env.JWT_SECRET = "test-secret-for-exam-routes";

let mongoServer;
let teacherToken, studentToken, globalAdminToken;
let school1, school2, classroom1, subject1, exam1;

beforeAll(async () => {
  // Disconnect any existing connection from the server.js import to ensure
  // we only use the in-memory replica set for this test suite.
  await mongoose.disconnect();

  // ✅ Run Mongo in replica set mode for transactions
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: "jest" },
    replSet: { count: 1 },
  });
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  process.env.MONGO_URI = mongoUri; // Set for the server's connectDB call
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise((resolve) => server.close(resolve));
  closeSocket(); // Ensure sockets don’t block Jest
});

beforeEach(async () => {
  // Clear collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // --- Seed Data ---
  school1 = await School.create({ name: "Zinnol High" });
  school2 = await School.create({ name: "Rival Academy" });

  const teacherUser = await User.create({
    name: "Teacher One",
    email: "teacher1@zinnol.com",
    password: "password123",
    role: roles.TEACHER,
    school: school1._id,
  });

  const studentUser = await User.create({
    name: "Student One",
    email: "student1@zinnol.com",
    password: "password123",
    role: roles.STUDENT,
    school: school1._id,
  });

  const globalAdminUser = await User.create({
    name: "Global Admin",
    email: "global@admin.com",
    password: "password123",
    role: roles.GLOBAL_SUPER_ADMIN,
  });

  // Tokens
  teacherToken = jwt.sign({ id: teacherUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  studentToken = jwt.sign({ id: studentUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  globalAdminToken = jwt.sign({ id: globalAdminUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);

  // Classroom, subject, exam
  classroom1 = await Classroom.create({
    school: school1._id,
    stage: "jss",
    level: 1,
    section: "A",
    teacher: teacherUser._id
  });
  subject1 = await Subject.create({ name: "Mathematics", code: "MTH", school: school1._id });

  exam1 = await Exam.create({
    school: school1._id,
    classroom: classroom1._id,
    subject: subject1._id,
    title: "Math Mid-Term",
    session: "2023/2024",
    term: 1,
  });
});

const request = supertest(app);

// --- TEST SUITE ---
describe("Exam Routes", () => {
  describe("Admin & Teacher Routes", () => {
    it("POST /api/exams - teacher can create an exam", async () => {
      const newExamData = {
        classroom: classroom1._id,
        title: "Science Fair Prep",
        session: "2023/2024",
        term: 1,
        subject: subject1._id,
      };
      const res = await request.post("/api/exams").set("Authorization", `Bearer ${teacherToken}`).send(newExamData);
      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe("Science Fair Prep");
      const examInDb = await Exam.findById(res.body.data._id);
      expect(examInDb).not.toBeNull();
    });

    it("GET /api/exams - teacher can fetch exams", async () => {
      const res = await request.get("/api/exams").set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data[0].title).toBe("Math Mid-Term");
    });

    it("POST /api/exams/:examId/questions - teacher can add a question (transaction safe)", async () => {
      const questionData = {
        questionText: "What is 2+2?",
        questionType: "objective",
        marks: 5,
        options: [{ text: "3" }, { text: "4" }],
        correctOptionIndex: 1,
      };
      const res = await request
        .post(`/api/exams/${exam1._id}/questions`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(questionData);

      expect(res.status).toBe(201);
      expect(res.body.data.questionText).toBe("What is 2+2?");
      const updatedExam = await Exam.findById(exam1._id);
      expect(updatedExam.totalMarks).toBe(5);
    });

    it("POST /api/exams/submissions/:id/mark - teacher can mark (404 if not found)", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request.post(`/api/exams/submissions/${fakeId}/mark`).set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Student Routes", () => {
    it("POST /api/exams/:examId/start - student not linked to profile → 403", async () => {
      const res = await request.post(`/api/exams/${exam1._id}/start`).set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("You are not registered as a student.");
    });

    it("PATCH /api/exams/submissions/:id/answer - student can submit answer (404 if no submission)", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request
        .patch(`/api/exams/submissions/${fakeId}/answer`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ questionId: new mongoose.Types.ObjectId(), answerText: "4" });

      expect(res.status).toBe(404);
    });
  });

  describe("Authorization & Access Control", () => {
    it("student cannot create exam", async () => {
      const res = await request.post("/api/exams").set("Authorization", `Bearer ${studentToken}`).send({
        classroom: classroom1._id,
        title: "Hacking Exam",
        session: "2023/2024",
        term: 1,
        subject: subject1._id,
      });
      expect(res.status).toBe(403);
    });

    it("teacher cannot start exam (student-only route)", async () => {
      const res = await request.post(`/api/exams/${exam1._id}/start`).set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(403);
    });

    it("teacher cannot access exam from another school", async () => {
      const otherExam = await Exam.create({
        school: school2._id,
        classroom: new mongoose.Types.ObjectId(),
        subject: new mongoose.Types.ObjectId(),
        title: "Rival Exam",
        session: "2023/2024",
        term: 1,
      });
      const res = await request
        .post(`/api/exams/${otherExam._id}/questions`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ text: "Question" });
      expect(res.status).toBe(403);
    });

    it("GLOBAL_SUPER_ADMIN can access any exam", async () => {
      const questionData = {
        questionText: "Global Admin Q",
        questionType: "objective",
        marks: 5,
        options: [{ text: "Yes" }, { text: "No" }],
        correctOptionIndex: 0,
      };
      const res = await request
        .post(`/api/exams/${exam1._id}/questions`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send(questionData);
      expect(res.status).toBe(201);
    });

    it("returns 404 if exam not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request.get(`/api/exams/${fakeId}/submissions`).set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(404);
    });
  });
});
