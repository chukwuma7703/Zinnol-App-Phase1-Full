import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import { default as app, server } from "../server.js";
import School from "../models/School.js";
import User from "../models/userModel.js";
import Subject from "../models/Subject.js";
import { closeSocket } from "../config/socket.js";
import { roles } from "../config/roles.js";

process.env.JWT_SECRET = "test-secret-for-subjects";

let mongoServer;
let principalToken, teacherToken, otherSchoolPrincipalToken;
let school1, school2;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise(resolve => server.close(resolve));
  closeSocket();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();

  school1 = await School.create({ name: "Test School 1" });
  school2 = await School.create({ name: "Test School 2" });

  const principalUser1 = await User.create({ name: "Principal 1", email: "p1@test.com", password: "password", role: roles.PRINCIPAL, school: school1._id });
  const teacherUser1 = await User.create({ name: "Teacher 1", email: "t1@test.com", password: "password", role: roles.TEACHER, school: school1._id });
  const principalUser2 = await User.create({ name: "Principal 2", email: "p2@test.com", password: "password", role: roles.PRINCIPAL, school: school2._id });

  principalToken = jwt.sign({ id: principalUser1._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  teacherToken = jwt.sign({ id: teacherUser1._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  otherSchoolPrincipalToken = jwt.sign({ id: principalUser2._id, tokenVersion: 0 }, process.env.JWT_SECRET);
});

describe("Subject Management Routes", () => {
  describe("POST /api/subjects", () => {
    it("should allow a principal to create a new subject", async () => {
      const subjectData = { name: "Mathematics", code: "MTH101", stageScope: ["JSS"] };
      const res = await request(app)
        .post("/api/subjects")
        .set("Authorization", `Bearer ${principalToken}`)
        .send(subjectData);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe("Mathematics");
      expect(res.body.school.toString()).toBe(school1._id.toString());
    });

    it("should deny a teacher from creating a subject", async () => {
      const subjectData = { name: "History", code: "HIS101" };
      const res = await request(app)
        .post("/api/subjects")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(subjectData);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain("Forbidden: Access denied.");
    });

    it("should return 400 if a subject with the same code already exists in the school", async () => {
      await Subject.create({ name: "Mathematics", code: "MTH101", school: school1._id });
      const subjectData = { name: "Advanced Maths", code: "MTH101" };
      const res = await request(app)
        .post("/api/subjects")
        .set("Authorization", `Bearer ${principalToken}`)
        .send(subjectData);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("subject with this code already exists");
    });

    it("should allow creating a subject with the same code in a different school", async () => {
      await Subject.create({ name: "Mathematics", code: "MTH101", school: school2._id });
      const subjectData = { name: "Mathematics", code: "MTH101" };
      const res = await request(app)
        .post("/api/subjects")
        .set("Authorization", `Bearer ${principalToken}`)
        .send(subjectData);

      expect(res.statusCode).toBe(201);
    });
  });

  describe("GET /api/subjects", () => {
    beforeEach(async () => {
      await Subject.create({ name: "Mathematics", code: "MTH101", school: school1._id });
      await Subject.create({ name: "English", code: "ENG101", school: school1._id });
      await Subject.create({ name: "Physics", code: "PHY101", school: school2._id });
    });

    it("should allow a principal to get all subjects for their school", async () => {
      const res = await request(app)
        .get("/api/subjects")
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.some(s => s.name === "Physics")).toBe(false);
    });

    it("should allow a teacher to get all subjects for their school", async () => {
      const res = await request(app)
        .get("/api/subjects")
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe("PUT /api/subjects/:id", () => {
    let subjectToUpdate;
    beforeEach(async () => {
      subjectToUpdate = await Subject.create({ name: "Chemistry", code: "CHM101", school: school1._id });
    });

    it("should allow a principal to update a subject", async () => {
      const res = await request(app)
        .put(`/api/subjects/${subjectToUpdate._id}`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send({ name: "Advanced Chemistry" });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe("Advanced Chemistry");
    });

    it("should deny a principal from updating a subject in another school", async () => {
      const res = await request(app)
        .put(`/api/subjects/${subjectToUpdate._id}`)
        .set("Authorization", `Bearer ${otherSchoolPrincipalToken}`)
        .send({ name: "Hacked Chemistry" });

      expect(res.statusCode).toBe(404); // 404 because the query filters by school
      expect(res.body.message).toContain("Subject not found or you do not have permission.");
    });

    it("should deny a teacher from updating a subject", async () => {
      const res = await request(app)
        .put(`/api/subjects/${subjectToUpdate._id}`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ name: "Teacher Chemistry" });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/subjects/:id", () => {
    let subjectToDelete;
    beforeEach(async () => {
      subjectToDelete = await Subject.create({ name: "Biology", code: "BIO101", school: school1._id });
    });

    it("should allow a principal to delete a subject", async () => {
      const res = await request(app)
        .delete(`/api/subjects/${subjectToDelete._id}`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Subject deleted successfully.");

      const deleted = await Subject.findById(subjectToDelete._id);
      expect(deleted).toBeNull();
    });

    it("should deny a teacher from deleting a subject", async () => {
      const res = await request(app)
        .delete(`/api/subjects/${subjectToDelete._id}`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(403);
    });
  });
});
