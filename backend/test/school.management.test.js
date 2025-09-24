import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/userModel.js";
import School from "../models/School.js";
import FeatureFlag from "../models/FeatureFlag.js";
import { roles } from "../config/roles.js";
import { generateAccessToken } from "../utils/generateToken.js";
import { closeSocket } from "../config/socket.js"; // Import the close function
import { default as app, server } from "../server.js";

describe("School Management (CRUD) in /api/schools", () => {

  let globalAdmin, mainSuperAdmin, teacher;
  let globalAdminToken, mainAdminToken, teacherToken;
  let school;
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await new Promise(resolve => server.close(resolve)); // Close server to allow Jest to exit
    closeSocket();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await School.deleteMany({});
    await FeatureFlag.deleteMany({});

    // Create required feature flags
    await FeatureFlag.create({
      name: "assign-main-super-admin",
      description: "Allow assigning main super admins to schools",
      isEnabled: true,
      isCore: false,
    });

    // 1. Create a school for testing updates and deletes
    school = await School.create({ name: "Zinnol High", address: "123 Test St", phone: "+1234567890", email: "school@zinnol.com" });

    // 2. Create users with different roles
    globalAdmin = await User.create({
      name: "Global Admin",
      email: "globaladmin@zinnol.com",
      password: "password123",
      role: roles.GLOBAL_SUPER_ADMIN,
    });

    mainSuperAdmin = await User.create({
      name: "Main Admin",
      email: "mainadmin@zinnol.com",
      password: "password123",
      role: roles.MAIN_SUPER_ADMIN,
      school: school._id, // This admin belongs to Zinnol High
    });

    teacher = await User.create({
      name: "Teacher",
      email: "teacher@zinnol.com",
      password: "password123",
      role: roles.TEACHER,
      school: school._id,
    });

    // Add the main admin to the school's list of owners
    school.mainSuperAdmins.push(mainSuperAdmin._id);
    await school.save();


    // 3. Generate auth tokens for requests
    globalAdminToken = generateAccessToken(globalAdmin);
    mainAdminToken = generateAccessToken(mainSuperAdmin);
    teacherToken = generateAccessToken(teacher);

  });

  /**
   * Tests for POST /api/schools (Create)
   */
  describe("POST /api/schools", () => {
    const newSchoolData = {
      name: "New Zinnol Academy",
      address: "456 Learning Ave",
      phone: "+1234567890",
      email: "new@zinnol.com"
    };

    it("should allow a GLOBAL_SUPER_ADMIN to create a new school", async () => {
      const res = await request(app)
        .post("/api/schools")
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send(newSchoolData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.school).toHaveProperty("name", "New Zinnol Academy");
      expect(res.body.message).toEqual("School created successfully");

      const createdSchool = await School.findById(res.body.school._id);
      expect(createdSchool).not.toBeNull();
    });

    it("should NOT allow a MAIN_SUPER_ADMIN to create a school (Forbidden)", async () => {
      const res = await request(app)
        .post("/api/schools")
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send(newSchoolData);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toContain("Forbidden");
    });
  });

  /**
   * Tests for PUT /api/schools/:id (Update)
   */
  describe("PUT /api/schools/:id", () => {
    const updateData = { name: "Zinnol High Updated" };

    it("should allow a GLOBAL_SUPER_ADMIN to update any school", async () => {
      const res = await request(app)
        .put(`/api/schools/${school._id}`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty("name", "Zinnol High Updated");

      const updatedSchool = await School.findById(school._id);
      expect(updatedSchool.name).toEqual("Zinnol High Updated");
    });

    it("should allow a MAIN_SUPER_ADMIN to update their own school", async () => {
      const res = await request(app)
        .put(`/api/schools/${school._id}`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.name).toEqual("Zinnol High Updated");
    });

    it("should NOT allow a TEACHER to update a school (Forbidden)", async () => {
      const res = await request(app)
        .put(`/api/schools/${school._id}`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(403);
    });

    it("should return 404 if school to update is not found", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/schools/${nonExistentId}`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toEqual("School not found");
    });
  });

  /**
   * Tests for POST /api/schools/:id/assign-main-super-admin
   */
  describe("POST /api/schools/:id/assign-main-super-admin", () => {
    it("should allow a GLOBAL_SUPER_ADMIN to assign a user as a Main Super Admin", async () => {
      // Use the 'teacher' user created in beforeEach as the user to be promoted
      const res = await request(app)
        .post(`/api/schools/${school._id}/assign-main-super-admin`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send({ userId: teacher._id });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toEqual("Main Super Admin assigned");

      // Verify the user's role and school were updated in the database
      const updatedUser = await User.findById(teacher._id);
      expect(updatedUser.role).toEqual(roles.MAIN_SUPER_ADMIN);
      expect(updatedUser.school.toString()).toEqual(school._id.toString());

      // Verify the school's list of admins was updated
      const updatedSchool = await School.findById(school._id);
      expect(updatedSchool.mainSuperAdmins.map(id => id.toString())).toContain(teacher._id.toString());
    });

    it("should NOT allow a MAIN_SUPER_ADMIN to assign another admin (Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/assign-main-super-admin`)
        .set("Authorization", `Bearer ${mainAdminToken}`)
        .send({ userId: teacher._id });

      expect(res.statusCode).toEqual(403);
    });

    it("should return 404 if the user to be assigned does not exist", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/schools/${school._id}/assign-main-super-admin`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send({ userId: nonExistentId });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toEqual("User not found");
    });

    it("should return 400 if trying to assign a GLOBAL_SUPER_ADMIN", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/assign-main-super-admin`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send({ userId: globalAdmin._id });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toEqual("Cannot assign a Global Super Admin as a Main Super Admin");
    });

    it("should return a success message if the user is already a Main Super Admin for the school", async () => {
      const res = await request(app)
        .post(`/api/schools/${school._id}/assign-main-super-admin`)
        .set("Authorization", `Bearer ${globalAdminToken}`)
        .send({ userId: mainSuperAdmin._id }); // mainSuperAdmin is already an admin of school

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toEqual("User is already a Main Super Admin for this school.");
    });
  });

  /**
   * Tests for DELETE /api/schools/:id (Delete)
   */
  describe("DELETE /api/schools/:id", () => {
    it("should allow a GLOBAL_SUPER_ADMIN to delete a school and all of its associated users", async () => {
      const schoolId = school._id;
      // Verify users exist before deletion
      const userCountBefore = await User.countDocuments({ school: schoolId });
      expect(userCountBefore).toBe(2); // mainSuperAdmin and teacher

      const res = await request(app)
        .delete(`/api/schools/${schoolId}`)
        .set("Authorization", `Bearer ${globalAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toEqual("School and all associated users removed");

      // Verify the school document was deleted
      const deletedSchool = await School.findById(schoolId);
      expect(deletedSchool).toBeNull();

      // Verify associated users were also deleted
      const userCountAfter = await User.countDocuments({ school: schoolId });
      expect(userCountAfter).toBe(0);
    });

    it("should NOT allow a MAIN_SUPER_ADMIN to delete a school (Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/schools/${school._id}`)
        .set("Authorization", `Bearer ${mainAdminToken}`);

      expect(res.statusCode).toEqual(403);
    });
  });
});
