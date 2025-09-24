import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import express from "express";
import supertest from "supertest";

// Mock all dependencies using jest.mock (must be before imports)
jest.mock("../models/Result.js");
jest.mock("../models/AnnualResult.js");
jest.mock("../models/ShareToken.js");
jest.mock("../models/TeachingAssignment.js");
jest.mock("../models/teacherActivityModel.js");
jest.mock("../models/timetableModel.js");
jest.mock("../models/userModel.js");
jest.mock("../models/School.js");
jest.mock("../models/StudentExam.js");
jest.mock("../models/Classroom.js");
jest.mock("mongoose");
jest.mock("../config/roles.js");
jest.mock("../middleware/errorMiddleware.js");

// Import the mocked modules
import School from "../models/School.js";
import User from "../models/userModel.js";
import Result from "../models/Result.js";
import AnnualResult from "../models/AnnualResult.js";
import ShareToken from "../models/ShareToken.js";
import TeachingAssignment from "../models/TeachingAssignment.js";
import TeacherActivity from "../models/teacherActivityModel.js";
import Timetable from "../models/timetableModel.js";
import StudentExam from "../models/StudentExam.js";
import Classroom from "../models/Classroom.js";
import { roles } from "../config/roles.js";
import errorHandler from "../middleware/errorMiddleware.js";

// Import the controller functions after mocking
import {
  getGlobalOverviewAnalytics,
  getSystemWideAnalytics,
  getStudentAnalytics,
  getTeacherAnalytics,
  getSchoolDashboardAnalytics,
  getSchoolAcademicTerms,
  getAllAcademicSessions,
  queryStudents,
  getClassroomLeaderboard,
  getDecliningStudents,
  createShareableLink,
  getTeacherActivityAnalytics,
  getTimetableCompliance,
  getStudentExamHistory
} from "./analysisController.js";

describe("Analysis Controller", () => {
  let mongoServer;
  let app;
  let request;

  beforeAll(async () => {
    jest.setTimeout(60000);
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Set up Express app for integration tests
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = {
        _id: "507f1f77bcf86cd799439011",
        role: roles.GLOBAL_SUPER_ADMIN,
        school: null
      };
      next();
    });

    // Set up routes
    app.get("/api/analytics/global-overview", getGlobalOverviewAnalytics);
    app.get("/api/analytics/system-wide", getSystemWideAnalytics);
    app.get("/api/analytics/student/:studentId", getStudentAnalytics);
    app.get("/api/analytics/teacher/:teacherId", getTeacherAnalytics);
    app.get("/api/analytics/school-dashboard", getSchoolDashboardAnalytics);
    app.get("/api/analytics/school-sessions/:schoolId", getSchoolAcademicTerms);
    app.get("/api/analytics/academic-sessions", getAllAcademicSessions);
    app.post("/api/analytics/query/students", queryStudents);
    app.get("/api/analytics/classroom-leaderboard", getClassroomLeaderboard);
    app.get("/api/analytics/declining-students", getDecliningStudents);
    app.post("/api/analytics/shareable-link", createShareableLink);
    app.get("/api/analytics/teacher-activity", getTeacherActivityAnalytics);
    app.get("/api/analytics/timetable-compliance", getTimetableCompliance);
    app.get("/api/analytics/student-exam-history/:studentId", getStudentExamHistory);

    // Add error handler middleware
    app.use(errorHandler);

    request = supertest(app);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getGlobalOverviewAnalytics", () => {
    it("should return global overview analytics successfully", async () => {
      // Manually mock the methods
      School.countDocuments = jest.fn().mockResolvedValue(10);
      User.countDocuments = jest.fn()
        .mockResolvedValueOnce(100) // total users
        .mockResolvedValueOnce(50)  // students
        .mockResolvedValueOnce(20)  // teachers
        .mockResolvedValueOnce(15)  // parents
        .mockResolvedValueOnce(5);  // active admins

      const res = await request.get("/api/analytics/global-overview");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalSchools", 10);
      expect(res.body).toHaveProperty("totalUsers", 100);
      expect(res.body).toHaveProperty("totalStudents", 50);
      expect(res.body).toHaveProperty("totalTeachers", 20);
      expect(res.body).toHaveProperty("totalParents", 15);
      expect(res.body).toHaveProperty("activeAdmins", 5);
    });

    it("should handle database errors", async () => {
      School.countDocuments = jest.fn().mockRejectedValue(new Error("Database error"));

      const res = await request.get("/api/analytics/global-overview");

      expect(res.status).toBe(500);
    });
  });

  describe("getSystemWideAnalytics", () => {
    it("should return system-wide analytics successfully", async () => {
      // Mock the complex aggregations with proper chainable methods
      const mockAggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          { schoolId: 'school1', schoolName: 'School A', averagePerformance: 85.5, studentCount: 100 },
          { schoolId: 'school2', schoolName: 'School B', averagePerformance: 78.2, studentCount: 80 }
        ])
      });

      Result.aggregate = mockAggregate
        .mockReturnValueOnce({
          read: jest.fn().mockResolvedValue([
            { schoolId: 'school1', schoolName: 'School A', averagePerformance: 85.5, studentCount: 100 },
            { schoolId: 'school2', schoolName: 'School B', averagePerformance: 78.2, studentCount: 80 }
          ])
        })
        .mockReturnValueOnce({
          read: jest.fn().mockResolvedValue([
            { name: 'Mathematics', averageScore: 82.3 },
            { name: 'English', averageScore: 79.1 }
          ])
        })
        .mockReturnValueOnce({
          read: jest.fn().mockResolvedValue([
            { date: new Date('2024-01-01'), count: 10 },
            { date: new Date('2024-02-01'), count: 15 }
          ])
        });

      User.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          { date: new Date('2024-01-01'), count: 10 },
          { date: new Date('2024-02-01'), count: 15 }
        ])
      });

      const res = await request.get("/api/analytics/system-wide?session=2024/2025");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveProperty("schoolPerformance");
      expect(res.body.data).toHaveProperty("userGrowth");
      expect(res.body.data).toHaveProperty("subjectPerformance");
      expect(res.body.data).toHaveProperty("resultSubmissionTrend");
    });

    it("should handle missing session parameter", async () => {
      const res = await request.get("/api/analytics/system-wide");

      expect(res.status).toBe(400);
    });
  });

  describe("getStudentAnalytics", () => {
    beforeEach(() => {
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            read: jest.fn().mockResolvedValue({
              _id: "507f1f77bcf86cd799439012",
              name: "John Doe",
              role: roles.STUDENT,
              school: "507f1f77bcf86cd799439011"
            })
          })
        })
      });
    });

    it("should get student analytics successfully", async () => {
      Result.find = jest.fn().mockResolvedValue([
        { subject: "Math", score: 85, term: 1, session: "2024/2025" }
      ]);
      AnnualResult.findOne = jest.fn().mockResolvedValue({
        student: "507f1f77bcf86cd799439012",
        session: "2024/2025",
        overallAverage: 82.5
      });

      const res = await request.get("/api/analytics/student/507f1f77bcf86cd799439012");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("performanceHistory");
      expect(res.body).toHaveProperty("termAnalysis");
    });

    it("should return 404 if student does not exist", async () => {
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            read: jest.fn().mockResolvedValue(null)
          })
        })
      });

      const res = await request.get("/api/analytics/student/507f1f77bcf86cd799439013");

      expect(res.status).toBe(404);
    });

    it("should return 400 for invalid student ID", async () => {
      const res = await request.get("/api/analytics/student/invalid");

      expect(res.status).toBe(400);
    });
  });

  describe("getTeacherAnalytics", () => {
    it("should get teacher analytics successfully", async () => {
      User.findById = jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439014",
        name: "Jane Smith",
        role: roles.TEACHER,
        school: "507f1f77bcf86cd799439011"
      });

      TeachingAssignment.find = jest.fn().mockResolvedValue([
        { subject: "Mathematics", classroom: "JSS 1A" }
      ]);

      Result.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          { subject: "Mathematics", averageScore: 82.5, studentCount: 25 }
        ])
      });

      const res = await request.get("/api/analytics/teacher/507f1f77bcf86cd799439014?session=2024/2025");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("analytics");
    });

    it("should return 400 if session is not provided", async () => {
      const res = await request.get("/api/analytics/teacher/507f1f77bcf86cd799439014");

      expect(res.status).toBe(400);
    });
  });

  describe("getSchoolDashboardAnalytics", () => {
    it("should get school dashboard data successfully", async () => {
      // Mock School.findById
      School.findById = jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Test School"
      });

      // Mock Result.aggregate calls with read method
      Result.aggregate = jest.fn()
        .mockReturnValueOnce({
          read: jest.fn().mockResolvedValue([
            { term: 1, averageScore: 75.5, studentCount: 50 },
            { term: 2, averageScore: 78.2, studentCount: 48 }
          ])
        })
        .mockReturnValueOnce({
          read: jest.fn().mockResolvedValue([
            { subject: "Math", averageScore: 82.3, studentCount: 45 },
            { subject: "English", averageScore: 79.1, studentCount: 43 }
          ])
        })
        .mockReturnValueOnce({
          read: jest.fn().mockResolvedValue([
            { classroom: "JSS 1A", averageScore: 85.2, studentCount: 25 },
            { classroom: "JSS 1B", averageScore: 80.1, studentCount: 23 }
          ])
        });

      // Mock User.countDocuments
      User.countDocuments = jest.fn()
        .mockResolvedValueOnce(100) // total students
        .mockResolvedValueOnce(10); // total teachers

      const res = await request.get("/api/analytics/school-dashboard?schoolId=507f1f77bcf86cd799439011&session=2024/2025&term=2");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("dashboard");
      expect(res.body.dashboard).toHaveProperty("totalStudents");
      expect(res.body.dashboard).toHaveProperty("totalTeachers");
      expect(res.body.dashboard).toHaveProperty("averagePerformance");
      expect(res.body.dashboard).toHaveProperty("subjectPerformance");
      expect(res.body.dashboard).toHaveProperty("classPerformance");
    });

    it("should return 400 if required parameters are missing", async () => {
      const res = await request.get("/api/analytics/school-dashboard");

      expect(res.status).toBe(400);
    });
  });

  describe("getAllAcademicSessions", () => {
    it("should return all academic sessions", async () => {
      Result.distinct = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue(["2023/2024", "2024/2025"])
      });

      const res = await request.get("/api/analytics/academic-sessions");

      expect(res.status).toBe(200);
      expect(res.body.data.sessions).toEqual(["2024/2025", "2023/2024"]); // sorted descending
    });
  });

  describe("queryStudents", () => {
    it("should query students successfully", async () => {
      Result.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          { studentId: "507f1f77bcf86cd799439015", fullName: "Alice Johnson", average: 85.5, position: 1 }
        ])
      });

      const res = await request
        .post("/api/analytics/query/students")
        .send({ schoolId: "507f1f77bcf86cd799439011", session: "2024/2025", term: 2, className: "JSS 1" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("results");
      expect(res.body.results).toHaveLength(1);
    });

    it("should return 400 if schoolId is missing", async () => {
      const res = await request
        .post("/api/analytics/query/students")
        .send({ className: "JSS 1" });

      expect(res.status).toBe(400);
    });
  });

  describe("getClassroomLeaderboard", () => {
    it("should return classroom leaderboard", async () => {
      Classroom.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            read: jest.fn().mockResolvedValue({
              _id: "507f1f77bcf86cd799439011",
              school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")
            })
          })
        })
      });

      Result.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        read: jest.fn().mockResolvedValue([
          { student: { fullName: "Alice Johnson", admissionNumber: "12345" }, average: 88.5 },
          { student: { fullName: "Bob Wilson", admissionNumber: "12346" }, average: 85.2 }
        ])
      });

      const res = await request.get("/api/analytics/classroom-leaderboard?classroomId=507f1f77bcf86cd799439011&session=2024/2025&term=2");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("leaderboard");
      expect(res.body.leaderboard).toHaveLength(2);
    });

    it("should return 400 if required parameters are missing", async () => {
      const res = await request.get("/api/analytics/classroom-leaderboard");

      expect(res.status).toBe(400);
    });
  });

  describe("getDecliningStudents", () => {
    it("should return declining students", async () => {
      School.findById = jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Test School"
      });

      Result.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          { student: "507f1f77bcf86cd799439015", name: "Alice Johnson", currentAverage: 65.5, previousAverage: 78.2 }
        ])
      });

      const res = await request.get("/api/analytics/declining-students?schoolId=507f1f77bcf86cd799439011&session=2024/2025&term=2");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("decliningStudents");
      expect(res.body.decliningStudents).toHaveLength(1);
    });

    it("should return 400 if schoolId or session is missing", async () => {
      const res = await request.get("/api/analytics/declining-students?schoolId=507f1f77bcf86cd799439011");

      expect(res.status).toBe(400);
    });
  });

  describe("createShareableLink", () => {
    it("should create shareable link successfully", async () => {
      ShareToken.create = jest.fn().mockResolvedValue({
        _id: "token123",
        token: "abc123",
        expiresAt: new Date()
      });

      const res = await request
        .post("/api/analytics/shareable-link")
        .send({
          type: "student-analytics",
          targetId: "507f1f77bcf86cd799439011"
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("shareUrl");
      expect(res.body).toHaveProperty("expiresAt");
    });

    it("should return 400 if required fields are missing", async () => {
      const res = await request
        .post("/api/analytics/shareable-link")
        .send({ session: "2024/2025" });

      expect(res.status).toBe(400);
    });
  });

  describe("getTeacherActivityAnalytics", () => {
    it("should return teacher activity analytics", async () => {
      School.findById = jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Test School"
      });

      TeacherActivity.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          {
            totalHoursByTeacher: [{ teacherId: "507f1f77bcf86cd799439014", teacherName: "John Doe", totalHours: 50 }],
            totalHoursBySubject: [],
            averageSessionDuration: 45,
            activityTimeline: []
          }
        ])
      });

      const res = await request.get("/api/analytics/teacher-activity?schoolId=507f1f77bcf86cd799439011&startDate=2024-01-01&endDate=2024-12-31");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("analytics");
      expect(res.body.analytics).toHaveProperty("totalHoursByTeacher");
    });

    it("should return 400 if required parameters are missing", async () => {
      const res = await request.get("/api/analytics/teacher-activity");

      expect(res.status).toBe(400);
    });
  });

  describe("getTimetableCompliance", () => {
    it("should return timetable compliance data", async () => {
      TeacherActivity.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        read: jest.fn().mockResolvedValue([
          { teacher: { _id: "507f1f77bcf86cd799439014" }, classroom: { _id: "507f1f77bcf86cd799439011" }, startTime: new Date(), durationInMinutes: 60 }
        ])
      });

      Timetable.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        read: jest.fn().mockResolvedValue([
          { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", teacher: { _id: "507f1f77bcf86cd799439014" }, classroom: { _id: "507f1f77bcf86cd799439011" } }
        ])
      });

      const res = await request.get("/api/analytics/timetable-compliance?schoolId=507f1f77bcf86cd799439011&startDate=2024-01-01&endDate=2024-12-31");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("missedSessions");
      expect(res.body).toHaveProperty("unscheduledSessions");
      expect(res.body).toHaveProperty("timingDiscrepancies");
    });

    it("should return 400 if required parameters are missing", async () => {
      const res = await request.get("/api/analytics/timetable-compliance");

      expect(res.status).toBe(400);
    });
  });

  describe("getStudentExamHistory", () => {
    it("should return student exam history", async () => {
      User.findById = jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439012",
        name: "John Doe",
        role: roles.STUDENT
      });

      StudentExam.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([
          { session: "2024/2025", exams: [{ title: "Math Exam", score: 85 }] }
        ])
      });

      const res = await request.get("/api/analytics/student-exam-history/507f1f77bcf86cd799439012");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveLength(1);
    });

    it("should return empty exam history if student does not exist", async () => {
      StudentExam.aggregate = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([])
      });

      const res = await request.get("/api/analytics/student-exam-history/507f1f77bcf86cd799439013");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("getSchoolAcademicTerms", () => {
    it("should return school academic terms", async () => {
      Result.distinct = jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue([1, 2, 3])
      });

      const res = await request.get("/api/analytics/school-sessions/507f1f77bcf86cd799439011");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveProperty("terms");
      expect(res.body.data.terms).toEqual(["1", "2", "3"]);
    });

    it("should return 400 if required parameters are missing", async () => {
      const res = await request.get("/api/analytics/school-sessions/invalid-id");

      expect(res.status).toBe(400);
    });
  });
});
