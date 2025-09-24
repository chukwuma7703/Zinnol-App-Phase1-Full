import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import { default as app, server } from "../server.js";
import School from "../models/School.js";
import User from "../models/userModel.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Student from "../models/Student.js";
import { closeSocket } from "../config/socket.js";
import TeacherActivity from "../models/teacherActivityModel.js";
import { roles } from "../config/roles.js";

process.env.JWT_SECRET = "test-secret-for-activity";

let mongoServer;
let teacherToken, principalToken, parentToken;
let school, classroom, subject, student;

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

  school = await School.create({ name: "Test School" });
  classroom = await Classroom.create({ school: school._id, stage: "jss", level: 1, section: "A", teacher: new mongoose.Types.ObjectId() });
  subject = await Subject.create({ name: "Mathematics", code: "MTH", school: school._id });
  student = await Student.create({ school: school._id, classroom: classroom._id, admissionNumber: "S001", firstName: "Test", lastName: "Student", gender: "Male" });

  const teacherUser = await User.create({ name: "Test Teacher", email: "teacher@test.com", password: "password", role: roles.TEACHER, school: school._id });
  const principalUser = await User.create({ name: "Test Principal", email: "principal@test.com", password: "password", role: roles.PRINCIPAL, school: school._id });
  const parentUser = await User.create({ name: "Test Parent", email: "parent@test.com", password: "password", role: roles.PARENT, school: school._id, studentProfile: student._id });

  teacherToken = jwt.sign({ id: teacherUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  principalToken = jwt.sign({ id: principalUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  parentToken = jwt.sign({ id: parentUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
});

describe("Teacher Activity Controller", () => {
  describe("POST /api/activity/start", () => {
    it("should allow a teacher to start a session", async () => {
      const res = await request(app)
        .post("/api/activity/start")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ classroomId: classroom._id, subjectId: subject._id, topic: "Algebra" });

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toBe("Session started successfully.");
      expect(res.body.activity.status).toBe("active");
      expect(res.body.activity.topic).toBe("Algebra");

      const activity = await TeacherActivity.findById(res.body.activity._id);
      expect(activity).not.toBeNull();
    });

    it("should prevent a teacher from starting a session if one is already active", async () => {
      await request(app)
        .post("/api/activity/start")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ classroomId: classroom._id, subjectId: subject._id, topic: "Geometry" });

      const res = await request(app)
        .post("/api/activity/start")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ classroomId: classroom._id, subjectId: subject._id, topic: "Trigonometry" });

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toContain("You already have an active session.");
    });

    it("should deny access to non-teacher roles", async () => {
      const res = await request(app)
        .post("/api/activity/start")
        .set("Authorization", `Bearer ${principalToken}`)
        .send({ classroomId: classroom._id, subjectId: subject._id, topic: "Fractions" });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /api/activity/:id/end", () => {
    let activeActivity;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/activity/start")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ classroomId: classroom._id, subjectId: subject._id, topic: "Calculus" });
      activeActivity = res.body.activity;
    });

    it("should allow a teacher to end their own session with valid feedback", async () => {
      const feedbackData = { feedbackNote: "This was an exceptionally productive session where we covered the core concepts of differentiation. The students were highly engaged, particularly during the interactive examples of the power rule, product rule, and quotient rule. We worked through several practice problems, and I was pleased to see that the majority of the class demonstrated a strong understanding. A few students found the chain rule challenging, so I plan to dedicate a portion of our next session to review it with more targeted examples. Overall, the class participation was excellent, and we are well on track with the curriculum for this term." };
      const res = await request(app)
        .patch(`/api/activity/${activeActivity._id}/end`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send(feedbackData);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Session ended successfully.");
      expect(res.body.activity.status).toBe("completed");
      expect(res.body.activity.endTime).toBeDefined();
      expect(res.body.activity.durationInMinutes).toBeDefined();
    });

    it("should return 400 if feedback note is less than 100 words", async () => {
      const feedbackNote = "Good class.";
      const res = await request(app)
        .patch(`/api/activity/${activeActivity._id}/end`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ feedbackNote });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("at least 100 words");
    });

    it("should prevent a teacher from ending a session that is not theirs", async () => {
      const otherTeacher = await User.create({ name: "Other Teacher", email: "other@test.com", password: "password", role: roles.TEACHER, school: school._id });
      const otherToken = jwt.sign({ id: otherTeacher._id, tokenVersion: 0 }, process.env.JWT_SECRET);

      const feedbackNote = "This is an exceptionally long and detailed feedback note that has been specifically crafted to contain significantly more than one hundred words. The purpose of this verbosity is to definitively pass the validation check within the controller logic. By ensuring this note is long enough, we can be absolutely certain that any test failure is due to the authorization check (i.e., the wrong teacher trying to end the session) and not because of a validation error related to the feedback note's length. This isolates the authorization logic for a more precise and reliable test case, which is a best practice in unit and integration testing.";
      const res = await request(app)
        .patch(`/api/activity/${activeActivity._id}/end`)
        .set("Authorization", `Bearer ${otherToken}`)
        .send({ feedbackNote });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/activity", () => {
    beforeEach(async () => {
      // Create an activity for the test teacher
      await request(app)
        .post("/api/activity/start")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ classroomId: classroom._id, subjectId: subject._id, topic: "Test Topic" });
    });

    it("should allow a principal to see activities in their school", async () => {
      const res = await request(app)
        .get("/api/activity")
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.activities.length).toBe(1);
      expect(res.body.activities[0].topic).toBe("Test Topic");
    });

    it("should allow a parent to see activities for their child's class", async () => {
      const res = await request(app)
        .get("/api/activity")
        .set("Authorization", `Bearer ${parentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.activities.length).toBe(1);
      expect(res.body.activities[0].classroom._id.toString()).toBe(classroom._id.toString());
    });

    it("should not show activities to a parent if their child is in a different class", async () => {
      const otherClassroom = await Classroom.create({ school: school._id, stage: "jss", level: 2, section: "B", teacher: new mongoose.Types.ObjectId() });
      const otherStudent = await Student.create({ school: school._id, classroom: otherClassroom._id, admissionNumber: "S002", firstName: "Other", lastName: "Student", gender: "Female" });
      const otherParent = await User.create({ name: "Other Parent", email: "otherparent@test.com", password: "password", role: roles.PARENT, school: school._id, studentProfile: otherStudent._id });
      const otherParentToken = jwt.sign({ id: otherParent._id, tokenVersion: 0 }, process.env.JWT_SECRET);

      const res = await request(app)
        .get("/api/activity")
        .set("Authorization", `Bearer ${otherParentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.activities.length).toBe(0);
    });
  });
});
