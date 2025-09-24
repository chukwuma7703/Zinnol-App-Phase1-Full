import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import School from "../models/School.js";
import User from "../models/userModel.js";
import { generateAccessToken } from "../utils/generateToken.js";
import { closeSocket } from "../config/socket.js";
import { roles } from "../config/roles.js";

// Mock background schedulers to prevent them from running during tests
vi.mock("../utils/notificationScheduler.js", () => ({
  __esModule: true,
  startNotificationScheduler: vi.fn(),
}));
vi.mock("../services/weatherUpdater.js", () => ({
  __esModule: true,
  scheduleWeatherUpdates: vi.fn(),
}));

// Defer dynamic import to lifecycle
let app; let server;

let mongoServer;
let mainSuperAdminToken, principalToken, teacherToken, otherSchoolPrincipalToken;
let school1, school2, studentUser;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  process.env.MONGO_URI = mongoUri;
  const mod = await import("../server.js");
  app = mod.default; server = mod.server;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise(resolve => server.close(resolve));
  closeSocket();
});

beforeEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // Seed data
  school1 = await School.create({ name: "Zinnol High" });
  school2 = await School.create({ name: "Rival Academy" });

  const mainSuperAdminUser = await User.create({ name: "Main Admin", email: "mainadmin@test.com", password: "password", role: roles.MAIN_SUPER_ADMIN, school: school1._id });
  const principalUser = await User.create({ name: "Principal", email: "principal@test.com", password: "password", role: roles.PRINCIPAL, school: school1._id });
  const teacherUser = await User.create({ name: "Teacher", email: "teacher@test.com", password: "password", role: roles.TEACHER, school: school1._id });
  const otherSchoolPrincipalUser = await User.create({ name: "Other Principal", email: "otherprincipal@test.com", password: "password", role: roles.PRINCIPAL, school: school2._id });

  studentUser = await User.create({
    name: "Original Student",
    email: "student@test.com",
    password: "password",
    role: roles.STUDENT,
    school: school1._id,
    className: "JSS 1A"
  });

  mainSuperAdminToken = generateAccessToken(mainSuperAdminUser);
  principalToken = generateAccessToken(principalUser);
  teacherToken = generateAccessToken(teacherUser);
  otherSchoolPrincipalToken = generateAccessToken(otherSchoolPrincipalUser);
  // Ensure ownership for MAIN_SUPER_ADMIN scenarios
  school1.mainSuperAdmins.push(mainSuperAdminUser._id);
  await school1.save();
});

describe("Student Management in /api/schools › PUT /api/schools/:schoolId/students/:studentId", () => {
  it("should allow a MAIN_SUPER_ADMIN to update a student's details", async () => {
    const updateData = { name: "Updated Student Name", className: "JSS 1B" };

    const res = await request(app)
      .put(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${mainSuperAdminToken}`)
      .send(updateData);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data.student).toHaveProperty('name', "Updated Student Name");
    expect(res.body.data.student).toHaveProperty('className', "JSS 1B");

    const dbStudent = await User.findById(studentUser._id);
    expect(dbStudent.name).toBe("Updated Student Name");
    expect(dbStudent.className).toBe("JSS 1B");
  });

  it("should allow a PRINCIPAL to update a student's details", async () => {
    const updateData = { name: "Principal Updated Name" };

    const res = await request(app)
      .put(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${principalToken}`)
      .send(updateData);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data.student).toHaveProperty('name', "Principal Updated Name");
    expect(res.body.data.student).toHaveProperty('className', "JSS 1A"); // Should not change if not provided
  });

  it("should deny a TEACHER from updating a student's details", async () => {
    const res = await request(app)
      .put(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ name: "Teacher Update Attempt" });

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toContain("Forbidden: Access denied.");
  });

  it("should return 404 if the student does not exist", async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/schools/${school1._id}/students/${nonExistentId}`)
      .set("Authorization", `Bearer ${principalToken}`)
      .send({ name: "Doesn't Matter" });

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toContain("Student not found");
  });

  it("should deny an admin from another school from updating the student", async () => {
    const res = await request(app)
      .put(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${otherSchoolPrincipalToken}`)
      .send({ name: "Cross-School Attack" });

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('success', false);
    // Either fails at school access or student scope
    expect([
      "Forbidden: Student does not belong to your school",
      "Forbidden: You can only manage your own school."
    ].some(msg => (res.body.message || '').includes(msg))).toBe(true);
  });
});

describe("Student Management in /api/schools › DELETE /api/schools/:schoolId/students/:studentId", () => {
  it("should allow a MAIN_SUPER_ADMIN to remove a student from the school", async () => {
    const res = await request(app)
      .delete(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${mainSuperAdminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.message).toBe("Student removed successfully");

    // Verify student is deleted from User collection
    const deletedUser = await User.findById(studentUser._id);
    expect(deletedUser).toBeNull();

    // Verify student is removed from school's student list
    const updatedSchool = await School.findById(school1._id);
    expect(updatedSchool.students).not.toContain(studentUser._id);
  });

  it("should allow a PRINCIPAL to remove a student from the school", async () => {
    const res = await request(app)
      .delete(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${principalToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.message).toBe("Student removed successfully");

    const deletedUser = await User.findById(studentUser._id);
    expect(deletedUser).toBeNull();
  });

  it("should deny a TEACHER from removing a student", async () => {
    const res = await request(app)
      .delete(`/api/schools/${school1._id}/students/${studentUser._id}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toContain("Forbidden: Access denied.");
  });

  it("should return 404 if the student to be removed does not exist", async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/schools/${school1._id}/students/${nonExistentId}`)
      .set("Authorization", `Bearer ${principalToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toContain("Student not found");
  });
});
