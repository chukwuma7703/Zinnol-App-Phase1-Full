import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";


import User from "../models/userModel.js";
import School from "../models/School.js";
import { roles } from "../config/roles.js";
import { generateAccessToken } from "../utils/generateToken.js";
import { closeSocket } from "../config/socket.js";

describe("User Management and Profile API in /api/users", () => {
  let app, server;
  let mongoServer;
  let globalAdmin, mainAdmin, teacher, otherSchoolAdmin;
  let globalAdminToken, mainAdminToken, teacherToken, otherSchoolAdminToken;
  let school1, school2;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    const serverModule = await import("../server.js");
    app = serverModule.default;
    server = serverModule.server;
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

    school1 = await School.create({ name: "Test University" });
    school2 = await School.create({ name: "Rival College" });

    globalAdmin = await User.create({ name: "Global Admin", email: "global@test.com", password: "password123", role: roles.GLOBAL_SUPER_ADMIN });
    mainAdmin = await User.create({ name: "Main Admin", email: "mainadmin@test.com", password: "password123", role: roles.MAIN_SUPER_ADMIN, school: school1._id });
    teacher = await User.create({ name: "Test Teacher", email: "teacher@test.com", password: "password123", role: roles.TEACHER, school: school1._id });
    otherSchoolAdmin = await User.create({ name: "Other Admin", email: "other@test.com", password: "password123", role: roles.MAIN_SUPER_ADMIN, school: school2._id });

    globalAdminToken = generateAccessToken(globalAdmin);
    mainAdminToken = generateAccessToken(mainAdmin);
    teacherToken = generateAccessToken(teacher);
    otherSchoolAdminToken = generateAccessToken(otherSchoolAdmin);
  });

  /**
   * Tests for GET /api/users/profile and PUT /api/users/profile
   */
  describe("User Profile (GET & PUT /api/users/profile)", () => {
    it("should allow an authenticated user to get their own profile", async () => {
      const res = await request(app)
        .get("/api/users/profile")
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe(teacher.email);
      expect(res.body.name).toBe(teacher.name);
    });

    it("should allow an authenticated user to update their own name", async () => {
      const newName = "Updated Teacher Name";
      const res = await request(app)
        .put("/api/users/profile")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ name: newName });

      expect(res.statusCode).toBe(200);
      expect(res.body.user.name).toBe(newName);

      const updatedUser = await User.findById(teacher._id);
      expect(updatedUser.name).toBe(newName);
    });

    it("should NOT allow updating profile without authentication", async () => {
        const res = await request(app)
            .get("/api/users/profile");
        
        expect(res.statusCode).toBe(401);
    });
  });

  /**
   * Tests for PUT /api/users/:id/status
   */
  describe("Admin: Update User Status (PUT /api/users/:id/status)", () => {
    it("should allow a GLOBAL_SUPER_ADMIN to deactivate a MAIN_SUPER_ADMIN", async () => {
        const res = await request(app)
            .put(`/api/users/${mainAdmin._id}/status`)
            .set("Authorization", `Bearer ${globalAdminToken}`)
            .send({ active: false });

        expect(res.statusCode).toBe(200);
        expect(res.body.user.isActive).toBe(false);

        const dbUser = await User.findById(mainAdmin._id);
        expect(dbUser.isActive).toBe(false);
    });

    it("should allow a MAIN_SUPER_ADMIN to deactivate a user in their school", async () => {
        const res = await request(app)
            .put(`/api/users/${teacher._id}/status`)
            .set("Authorization", `Bearer ${mainAdminToken}`)
            .send({ active: false });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.user.isActive).toBe(false);
    });

    it("should NOT allow a MAIN_SUPER_ADMIN to deactivate a user in another school", async () => {
        const res = await request(app)
            .put(`/api/users/${teacher._id}/status`)
            .set("Authorization", `Bearer ${otherSchoolAdminToken}`)
            .send({ active: false });
        
        expect(res.statusCode).toBe(403);
        expect(res.body.message).toContain("Cannot modify user outside your school");
    });

    it("should NOT allow a user to deactivate their own account via this endpoint", async () => {
        const res = await request(app)
            .put(`/api/users/${mainAdmin._id}/status`)
            .set("Authorization", `Bearer ${mainAdminToken}`)
            .send({ active: false });
        
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("You cannot deactivate your own account.");
    });

    it("should return a 400 error if 'active' is not a boolean", async () => {
        const res = await request(app)
            .put(`/api/users/${teacher._id}/status`)
            .set("Authorization", `Bearer ${mainAdminToken}`)
            .send({ active: "not-a-boolean" });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("The 'active' field must be a boolean (true or false).");
    });
  });
});

