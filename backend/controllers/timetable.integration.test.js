import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import { default as app, server } from "../server.js";
import School from "../models/School.js";
import User from "../models/userModel.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Timetable from "../models/timetableModel.js";
import TeacherActivity from "../models/teacherActivityModel.js";
import { closeSocket } from "../config/socket.js";
import { roles } from "../config/roles.js";

process.env.JWT_SECRET = "test-secret-for-timetable";

let mongoServer;
let principalToken, teacherToken;
let school, classroom, subject, teacher;

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
  const principalUser = await User.create({ name: "Test Principal", email: "principal@test.com", password: "password", role: roles.PRINCIPAL, school: school._id });
  teacher = await User.create({ name: "Test Teacher", email: "teacher@test.com", password: "password", role: roles.TEACHER, school: school._id });

  principalToken = jwt.sign({ id: principalUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  teacherToken = jwt.sign({ id: teacher._id, tokenVersion: 0 }, process.env.JWT_SECRET);
});

describe("Timetable and Compliance Analytics", () => {
  describe("Timetable CRUD", () => {
    it("should allow a principal to create a timetable entry", async () => {
      const entryData = {
        school: school._id,
        classroom: classroom._id,
        subject: subject._id,
        teacher: teacher._id,
        dayOfWeek: 1, // Monday
        startTime: "09:00",
        endTime: "10:00",
      };

      const res = await request(app)
        .post("/api/timetables")
        .set("Authorization", `Bearer ${principalToken}`)
        .send(entryData);

      expect(res.statusCode).toBe(201);
      expect(res.body.dayOfWeek).toBe(1);
    });

    it("should allow a teacher to get the timetable for their school", async () => {
      await Timetable.create({ school: school._id, classroom: classroom._id, subject: subject._id, teacher: teacher._id, dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });

      const res = await request(app)
        .get(`/api/timetables?classroomId=${classroom._id}`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe("GET /api/analytics/timetable-compliance", () => {
    it("should correctly identify missed and unscheduled sessions", async () => {
      // Expected session on a Monday
      await Timetable.create({ school: school._id, classroom: classroom._id, subject: subject._id, teacher: teacher._id, dayOfWeek: 1, startTime: "09:00", endTime: "10:00" });

      // Actual session that was unscheduled (e.g., a makeup class)
      await TeacherActivity.create({
        school: school._id,
        classroom: classroom._id,
        subject: subject._id,
        teacher: teacher._id,
        topic: "Unscheduled Makeup",
        startTime: new Date("2024-01-02T11:00:00Z"), // A Tuesday
        endTime: new Date("2024-01-02T12:00:00Z"),
        durationInMinutes: 60,
        status: "completed",
      });

      // Date range covering Monday and Tuesday
      const startDate = "2024-01-01";
      const endDate = "2024-01-02";

      const res = await request(app)
        .get(`/api/analytics/timetable-compliance?schoolId=${school._id}&startDate=${startDate}&endDate=${endDate}`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);

      // The Monday 9am class was missed
      expect(res.body.missedSessions).toHaveLength(1);
      expect(res.body.missedSessions[0].expectedStartTime).toBe("09:00");

      // The Tuesday 11am class was not on the timetable
      expect(res.body.unscheduledSessions).toHaveLength(1);
      expect(res.body.unscheduledSessions[0].topic).toBe("Unscheduled Makeup");
    });
  });
});
