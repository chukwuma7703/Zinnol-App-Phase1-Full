// DEPRECATED integration test (replaced by unit tests in unit/controllers/resultVoiceNote.unit.test.js)

import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import fs from "fs"; // Use the standard 'fs' module for synchronous methods
import path from "path";
// Import app directly to avoid server/socket side-effects & ESM top-level await complexities
import app from "../app.js";

// Models
import School from "../models/School.js";
import User from "../models/userModel.js";
import Student from "../models/Student.js";
import Classroom from "../models/Classroom.js";
import Result from "../models/Result.js";
import { roles } from "../config/roles.js";

// Mock the JWT secret
process.env.JWT_SECRET = "test-secret-for-results";

let mongoServer;
let teacherToken, principalToken, otherSchoolTeacherToken, studentToken;
let school1, student1, classroom1, result1;
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "voice-notes");

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Ensure the upload directory exists for tests
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  // Clean up the uploads directory after all tests have run
  if (fs.existsSync(UPLOAD_DIR)) {
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  // Clear all collections before each test to ensure a clean state
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // --- Seed Data ---
  school1 = await School.create({ name: "Zinnol High" });
  const school2 = await School.create({ name: "Rival School" });

  // Create users with different roles and schools
  const teacherUser = await User.create({ name: "Teacher", email: "teacher@zinnol.com", password: "password", role: roles.TEACHER, school: school1._id });
  teacherToken = jwt.sign({ id: teacherUser._id, tokenVersion: teacherUser.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const principalUser = await User.create({ name: "Principal", email: "principal@zinnol.com", password: "password", role: roles.PRINCIPAL, school: school1._id });
  principalToken = jwt.sign({ id: principalUser._id, tokenVersion: principalUser.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const otherTeacherUser = await User.create({ name: "Other Teacher", email: "teacher@rival.com", password: "password", role: roles.TEACHER, school: school2._id });
  otherSchoolTeacherToken = jwt.sign({ id: otherTeacherUser._id, tokenVersion: otherTeacherUser.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const studentUser = await User.create({ name: "Student", email: "student@zinnol.com", password: "password", role: roles.STUDENT, school: school1._id });
  studentToken = jwt.sign({ id: studentUser._id, tokenVersion: studentUser.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });

  classroom1 = await Classroom.create({
    school: school1._id,
    stage: "jss",
    level: 1,
    teacher: teacherUser._id,
    // section defaults to 'A'
  });
  student1 = await Student.create({
    school: school1._id,
    classroom: classroom1._id,
    firstName: "Test",
    lastName: "Student",
    admissionNumber: "ZNL-001",
    gender: "Male",
  });
  result1 = await Result.create({
    student: student1._id,
    school: school1._id,
    classroom: classroom1._id,
    session: "2023/2024",
    term: 1,
    items: [],
  });
});

describe("POST /api/results/:resultId/voice-note", () => {
  // Use a sub-describe block for file-specific setup/teardown
  const testFilePath = path.join(process.cwd(), "test-audio.mp3");
  const largeFilePath = path.join(process.cwd(), "large-audio.mp3");

  beforeAll(() => {
    fs.writeFileSync(testFilePath, "dummy audio content");
    fs.writeFileSync(largeFilePath, Buffer.alloc(2 * 1024 * 1024));
  });

  afterAll(() => {
    fs.unlinkSync(testFilePath);
    fs.unlinkSync(largeFilePath);
  });

  it("should allow a teacher to upload a voice note", async () => {
    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Voice note uploaded and linked successfully.");
    expect(res.body.success).toBe(true);
    expect(res.body.data.voiceNoteUrl).toBeDefined();

    expect(res.body.success).toBe(true);
    const updatedResult = await Result.findById(result1._id);
    expect(updatedResult.teacherVoiceNoteUrl).toBe(res.body.data.voiceNoteUrl);
    expect(updatedResult.principalVoiceNoteUrl).toBeUndefined();
  });

  it("should allow a principal to upload a voice note", async () => {
    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${principalToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(200);
    const updatedResult = await Result.findById(result1._id);
    expect(updatedResult.principalVoiceNoteUrl).toBe(res.body.data.voiceNoteUrl);
    expect(updatedResult.teacherVoiceNoteUrl).toBeUndefined();
  });

  it("should return 409 Conflict if a teacher tries to overwrite an existing voice note", async () => {
    await result1.updateOne({ teacherVoiceNoteUrl: "/uploads/voice-notes/existing.mp3" });

    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("A teacher voice note already exists. It cannot be replaced.");
  });

  it("should return 409 Conflict if a principal tries to overwrite an existing voice note", async () => {
    await result1.updateOne({ principalVoiceNoteUrl: "/uploads/voice-notes/existing.mp3" });

    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${principalToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("A principal voice note already exists. It cannot be replaced.");
  });

  // --- New test cases for more robust coverage ---
  it("should return 404 Not Found if the result ID does not exist", async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/results/${nonExistentId}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Result sheet not found.");
  });

  it("should return 403 Forbidden if a teacher from another school tries to upload", async () => {
    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${otherSchoolTeacherToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Forbidden: You do not have permission for this result sheet.");
  });

  it("should return 403 Forbidden for an unauthorized user role (e.g., student)", async () => {
    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${studentToken}`)
      .attach("voiceNote", testFilePath);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("Forbidden: Access denied. Required role(s):");
  });

  it("should return 400 Bad Request if no file is uploaded", async () => {
    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("No voice note file uploaded.");
  });

  it("should return 400 Bad Request if the file is not an audio file", async () => {
    const nonAudioFilePath = path.join(process.cwd(), "test-text.txt");
    fs.writeFileSync(nonAudioFilePath, "dummy text content");

    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .attach("voiceNote", nonAudioFilePath);

    fs.unlinkSync(nonAudioFilePath);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Not an audio file! Please upload only audio.");
  });

  it("should return 400 Bad Request if the file size exceeds the 1MB limit", async () => {
    const res = await request(app)
      .post(`/api/results/${result1._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .attach("voiceNote", largeFilePath);

    expect(res.statusCode).toBe(400);
    // Controller currently returns a more descriptive message
    expect(res.body.message).toBe("File too large. Maximum size is 5MB.");
  });
});

describe("DELETE /api/results/:resultId/voice-note", () => {
  let resultWithTeacherNote;

  beforeEach(async () => {
    // Create a result that already has a voice note for deletion tests
    resultWithTeacherNote = await Result.create({
      ...result1.toObject(),
      _id: new mongoose.Types.ObjectId(), // new ID
      teacherVoiceNoteUrl: "/uploads/voice-notes/teacher-note-to-delete.mp3",
      principalVoiceNoteUrl: "/uploads/voice-notes/principal-note-to-delete.mp3",
    });
  });

  it("should allow a teacher to delete their own voice note if the result is pending", async () => {
    const res = await request(app)
      .delete(`/api/results/${resultWithTeacherNote._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Voice note deleted successfully.");

    const updatedResult = await Result.findById(resultWithTeacherNote._id);
    expect(updatedResult.teacherVoiceNoteUrl).toBeUndefined();
    expect(updatedResult.principalVoiceNoteUrl).toBeDefined(); // Principal's note should remain
  });

  it("should allow a principal to delete their own voice note", async () => {
    const res = await request(app)
      .delete(`/api/results/${resultWithTeacherNote._id}/voice-note`)
      .set("Authorization", `Bearer ${principalToken}`);

    expect(res.statusCode).toBe(200);
    const updatedResult = await Result.findById(resultWithTeacherNote._id);
    expect(updatedResult.principalVoiceNoteUrl).toBeUndefined();
    expect(updatedResult.teacherVoiceNoteUrl).toBeDefined(); // Teacher's note should remain
  });

  it("should return 404 if a user tries to delete a note when none exists for their role", async () => {
    // Update the result to have no teacher note
    await resultWithTeacherNote.updateOne({ $unset: { teacherVoiceNoteUrl: "" } });

    const res = await request(app)
      .delete(`/api/results/${resultWithTeacherNote._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("No voice note found for your role to delete.");
  });

  it("should return 403 if a user tries to delete a voice note on an approved result", async () => {
    await resultWithTeacherNote.updateOne({ status: "approved" });
    const res = await request(app)
      .delete(`/api/results/${resultWithTeacherNote._id}/voice-note`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Cannot delete voice note after result has been approved or published.");
  });
});
