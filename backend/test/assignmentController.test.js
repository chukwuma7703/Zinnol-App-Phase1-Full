import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// Models
import School from "../models/School.js";
import User from "../models/userModel.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Student from "../models/Student.js";
import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import { roles } from "../config/roles.js";

// Mock background services (CommonJS compatibility)
vi.mock("../utils/notificationScheduler.js", () => ({ startNotificationScheduler: vi.fn() }));
vi.mock("../services/weatherUpdater.js", () => ({ scheduleWeatherUpdates: vi.fn() }));
vi.mock("../config/socket.js", () => ({ closeSocket: vi.fn(), getIO: () => ({ emit: vi.fn() }) }));
import app from "../server.js";
import { closeSocket } from "../config/socket.js";

process.env.JWT_SECRET = "test-secret-for-assignments";

let teacherToken, studentToken, principalToken;
let school, classroom, subject, student, teacherUser;
let assignment;

beforeAll(async () => {
    // Global setup already connected a MongoMemoryServer.
    // Ensure connection is live; reconnect if dropped.
    if (mongoose.connection.readyState !== 1) {
        // Use URL from env (set by globalSetup) or fallback.
        const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/jest";
        await mongoose.connect(uri);
    }
});

afterAll(async () => {
    // Do NOT disconnect mongoose here (global teardown will handle it) to avoid
    // closing the shared connection while other test suites run.
    closeSocket();
});

beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }

    school = await School.create({ name: "Test School" });

    teacherUser = await User.create({ name: "Test Teacher", email: "teacher@test.com", password: "password", role: roles.TEACHER, school: school._id });
    classroom = await Classroom.create({ school: school._id, stage: "jss", level: 1, section: "A", teacher: teacherUser._id });
    subject = await Subject.create({ name: "Mathematics", code: "MTH", school: school._id });
    student = await Student.create({ school: school._id, classroom: classroom._id, admissionNumber: "S001", firstName: "Alice", lastName: "A", gender: "Female" });

    const studentUser = await User.create({ name: "Alice A", email: "student@test.com", password: "password", role: roles.STUDENT, school: school._id, studentProfile: student._id });
    const principalUser = await User.create({ name: "Principal", email: "principal@test.com", password: "password", role: roles.PRINCIPAL, school: school._id });

    teacherToken = jwt.sign({ id: teacherUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
    studentToken = jwt.sign({ id: studentUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);
    principalToken = jwt.sign({ id: principalUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);

    assignment = await Assignment.create({
        school: school._id,
        classroom: classroom._id,
        subject: subject._id,
        teacher: teacherUser._id,
        title: "Math Homework 1",
        description: "Solve the first 10 problems.",
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due tomorrow
        status: 'published',
    });
});

describe("Assignment Controller API (/api/assignments)", () => {

    describe("POST /api/assignments (createAssignment)", () => {
        it("should allow a teacher to create a new assignment", async () => {
            const newAssignmentData = {
                classroom: classroom._id,
                subject: subject._id,
                title: "New Algebra Assignment",
                description: "Complete exercises 1-5.",
                dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
            };

            const res = await request(app)
                .post("/api/assignments")
                .set("Authorization", `Bearer ${teacherToken}`)
                .send(newAssignmentData);

            expect(res.statusCode).toBe(201);
            expect(res.body.data.title).toBe("New Algebra Assignment");
            expect(res.body.data.teacher.toString()).toBe(teacherUser._id.toString());
        });

        it("should NOT allow a student to create an assignment", async () => {
            const newAssignmentData = {
                classroom: classroom._id,
                subject: subject._id,
                title: "I am a student trying to create work",
                description: "This should fail.",
                dueDate: new Date(),
            };

            const res = await request(app)
                .post("/api/assignments")
                .set("Authorization", `Bearer ${studentToken}`)
                .send(newAssignmentData);

            expect(res.statusCode).toBe(403);
        });

        it("should return 400 if required fields are missing", async () => {
            const res = await request(app)
                .post("/api/assignments")
                .set("Authorization", `Bearer ${teacherToken}`)
                .send({ title: "Incomplete Assignment" });

            // This test passes because Mongoose model validation fails,
            // and the global errorHandler converts it to a 400-level error.
            // For better DX, consider adding Joi validation in the route.
            expect(res.statusCode).toBe(400);
            expect(res.body.type).toBe('VALIDATION_ERROR');
        });
    });

    describe("GET /api/assignments/class/:classroomId (getAssignmentsForClass)", () => {
        it("should allow a student to get assignments for their class", async () => {
            const res = await request(app)
                .get(`/api/assignments/class/${classroom._id}`)
                .set("Authorization", `Bearer ${studentToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe("Math Homework 1");
        });

        it("should allow a teacher to get assignments for a class", async () => {
            const res = await request(app)
                .get(`/api/assignments/class/${classroom._id}`)
                .set("Authorization", `Bearer ${teacherToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });

        it("should deny access to a principal (or other non-student/teacher roles)", async () => {
            const res = await request(app)
                .get(`/api/assignments/class/${classroom._id}`)
                .set("Authorization", `Bearer ${principalToken}`);

            expect(res.statusCode).toBe(403);
        });
    });

    describe("POST /api/assignments/:id/submit (submitAssignment)", () => {
        it("should allow a student to submit their work", async () => {
            const submissionData = {
                textSubmission: "Here are my answers: 1. A, 2. B, 3. C",
            };

            const res = await request(app)
                .post(`/api/assignments/${assignment._id}/submit`)
                .set("Authorization", `Bearer ${studentToken}`)
                .send(submissionData);

            expect(res.statusCode).toBe(201);
            expect(res.body.data.status).toBe("submitted");
            expect(res.body.data.textSubmission).toBe(submissionData.textSubmission);

            const submissionInDb = await AssignmentSubmission.findById(res.body.data._id);
            expect(submissionInDb).not.toBeNull();
            expect(submissionInDb.student.toString()).toBe(student._id.toString());
        });

        it("should mark a submission as 'late' if submitted after the due date", async () => {
            const lateAssignment = await Assignment.create({
                ...assignment.toObject(),
                _id: new mongoose.Types.ObjectId(),
                dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Due yesterday
            });

            const res = await request(app)
                .post(`/api/assignments/${lateAssignment._id}/submit`)
                .set("Authorization", `Bearer ${studentToken}`)
                .send({ textSubmission: "Sorry this is late." });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.status).toBe("late");
        });

        it("should return 409 if a student tries to submit the same assignment twice", async () => {
            await request(app)
                .post(`/api/assignments/${assignment._id}/submit`)
                .set("Authorization", `Bearer ${studentToken}`)
                .send({ textSubmission: "First attempt." });

            const res = await request(app)
                .post(`/api/assignments/${assignment._id}/submit`)
                .set("Authorization", `Bearer ${studentToken}`)
                .send({ textSubmission: "Second attempt." });

            expect(res.statusCode).toBe(409);
            expect(res.body.message).toBe("You have already submitted this assignment.");
        });
    });

    describe("PATCH /api/assignments/submissions/:submissionId/grade (gradeSubmission)", () => {
        let submission;
        beforeEach(async () => {
            submission = await AssignmentSubmission.create({
                assignment: assignment._id,
                student: student._id,
                status: 'submitted',
                textSubmission: 'Here is my work.'
            });
        });

        it("should allow a teacher to grade a submission", async () => {
            const gradingData = {
                grade: "A",
                feedback: "Excellent work!",
            };

            const res = await request(app)
                .patch(`/api/assignments/submissions/${submission._id}/grade`)
                .set("Authorization", `Bearer ${teacherToken}`)
                .send(gradingData);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.status).toBe("graded");
            expect(res.body.data.grade).toBe("A");
            expect(res.body.data.feedback).toBe("Excellent work!");
            expect(res.body.data.gradedBy.toString()).toBe(teacherUser._id.toString());
        });

        it("should return 403 if a student tries to grade a submission", async () => {
            const res = await request(app)
                .patch(`/api/assignments/submissions/${submission._id}/grade`)
                .set("Authorization", `Bearer ${studentToken}`)
                .send({ grade: "A+", feedback: "I graded my own work." });

            expect(res.statusCode).toBe(403);
        });
    });
});