import request from "supertest";
import mongoose from "mongoose";
import { vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/userModel.js";
import School from "../models/School.js";
import { roles } from "../config/roles.js";
import { generateAccessToken } from "../utils/generateToken.js";
import { closeSocket } from "../config/socket.js";

vi.mock("../config/firebaseAdmin.js", () => ({
  __esModule: true,
  messaging: null,
}));

// We'll import the app/server inside beforeAll to avoid top-level await issues
let app; let server;
process.env.JWT_SECRET = "a-secure-test-secret-for-students"; // ensure secret present early

describe("Student Management in /api/schools", () => {
  let mainSuperAdmin, principal, teacher, school, student, globalSuperAdmin;
  let adminToken, principalToken, teacherToken, globalAdminToken;
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    // Dynamic import after env + mocks
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
    await User.deleteMany({});
    await School.deleteMany({});

    // 1. Create a school
    school = await School.create({ name: "Zinnol High" });

    // Create a global admin for tests that require it
    globalSuperAdmin = await User.create({
      name: "Global Admin",
      email: "ceo@zinnol.com",
      password: "password123",
      role: roles.GLOBAL_SUPER_ADMIN,
    });
    // 2. Create users with different roles for that school
    mainSuperAdmin = await User.create({
      name: "Main Admin",
      email: "mainadmin@zinnol.com",
      password: "password123",
      role: roles.MAIN_SUPER_ADMIN,
      school: school._id,
    });

    principal = await User.create({
      name: "Principal",
      email: "principal@zinnol.com",
      password: "password123",
      role: roles.PRINCIPAL,
      school: school._id,
    });

    teacher = await User.create({
      name: "Teacher",
      email: "teacher@zinnol.com",
      password: "password123",
      role: roles.TEACHER,
      school: school._id,
    });

    student = await User.create({
      name: "Initial Student",
      email: "student@zinnol.com",
      password: "password123",
      role: roles.STUDENT,
      school: school._id,
      className: "JSS 1",
    });

    // 3. Add student to school's list and save
    school.mainSuperAdmins.push(mainSuperAdmin._id);
    school.students.push(student._id);
    await school.save();

    // 4. Generate auth tokens for requests
    adminToken = generateAccessToken(mainSuperAdmin);
    principalToken = generateAccessToken(principal);
    teacherToken = generateAccessToken(teacher);
    globalAdminToken = generateAccessToken(globalSuperAdmin);
  });

  /**
   * Tests for adding a new student to a school.
   */
  describe("POST /api/schools/:schoolId/students", () => {
    const newStudentData = {
      name: "New Student",
      email: "newstudent@zinnol.com",
      password: "password123",
      className: "JSS 2",
    };

    it("should allow a MAIN_SUPER_ADMIN to add a new student", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/students`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(newStudentData);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.student).toHaveProperty("name", "New Student");
      expect(res.body.data.student).toHaveProperty("role", "student");

      const newUser = await User.findOne({ email: "newstudent@zinnol.com" });
      expect(newUser).not.toBeNull();

      const updatedSchool = await School.findById(school._id);
      expect(updatedSchool.students).toContainEqual(newUser._id);
    });

    it("should allow a PRINCIPAL to add a new student", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/students`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send(newStudentData);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.student).toHaveProperty("email", "newstudent@zinnol.com");
    });

    it("should NOT allow a TEACHER to add a new student (Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/students`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(newStudentData);

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toContain("Forbidden");
    });

    it("should return 400 if email already exists", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/students`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...newStudentData, email: "student@zinnol.com" }); // Existing email

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toEqual("User with this email already exists.");
    });
  });

  /**
   * Tests for updating an existing student.
   */
  describe("PUT /api/schools/:schoolId/students/:studentId", () => {
    const updateData = { name: "Updated Student Name", className: "JSS 3" };

    it("should allow a PRINCIPAL to update a student's details", async () => {
      const res = await request(app)
        .put(`/api/schools/${school._id}/students/${student._id}`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.student).toHaveProperty("name", "Updated Student Name");
      expect(res.body.data.student).toHaveProperty("className", "JSS 3");

      const updatedStudent = await User.findById(student._id);
      expect(updatedStudent.name).toEqual("Updated Student Name");
    });

    it("should NOT allow a TEACHER to update a student (Forbidden)", async () => {
      const res = await request(app)
        .put(`/api/schools/${school._id}/students/${student._id}`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('success', false);
    });

    it("should return 404 if student does not exist", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/schools/${school._id}/students/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.message).toEqual("Student not found in this school.");
    });
  });

  /**
   * Tests for removing a student from a school.
   */
  describe("DELETE /api/schools/:schoolId/students/:studentId", () => {
    it("should allow a MAIN_SUPER_ADMIN to delete a student", async () => {
      const res = await request(app)
        .delete(`/api/schools/${school._id}/students/${student._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toEqual("Student removed successfully");

      // Verify user document was deleted
      const deletedUser = await User.findById(student._id);
      expect(deletedUser).toBeNull();

      // Verify student was removed from school's student list
      const updatedSchool = await School.findById(school._id);
      expect(updatedSchool.students).not.toContainEqual(student._id);
    });

    it("should NOT allow a TEACHER to delete a student (Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/schools/${school._id}/students/${student._id}`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  /**
   * Tests for deleting a school.
   */
  describe("DELETE /api/schools/:schoolId", () => {
    it("should allow a GLOBAL_SUPER_ADMIN to delete a school and its users", async () => {
      const schoolId = school._id;
      const userCountBefore = await User.countDocuments({ school: schoolId });
      expect(userCountBefore).toBeGreaterThan(0);

      const res = await request(app)
        .delete(`/api/schools/${schoolId}`)
        .set("Authorization", `Bearer ${globalAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.message).toEqual("School and all associated users removed");

      const deletedSchool = await School.findById(schoolId);
      expect(deletedSchool).toBeNull();

      const userCountAfter = await User.countDocuments({ school: schoolId });
      expect(userCountAfter).toEqual(0);
    });

    it("should NOT allow a PRINCIPAL to delete a school (Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/schools/${school._id}`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('success', false);
      const schoolExists = await School.findById(school._id);
      expect(schoolExists).not.toBeNull();
    });
  });
});
