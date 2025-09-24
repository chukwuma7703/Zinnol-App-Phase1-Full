import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import {
    createAssignment,
    getAssignmentsForClass,
    submitAssignment,
    gradeSubmission
} from "../controllers/assignmentController.js";
import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import School from "../models/School.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { roles } from "../config/roles.js";
import errorHandler from "../middleware/errorMiddleware.js";

let mongoServer;
let app;
let mockUser = {
    _id: "507f1f77bcf86cd799439011",
    role: roles.TEACHER,
    school: "507f1f77bcf86cd799439012",
    studentProfile: null
};

const setMockUser = (user) => {
    mockUser = { ...user };
};

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
        req.user = { ...mockUser };
        next();
    });

    // Set up routes
    app.post("/api/assignments", createAssignment);
    app.get("/api/assignments/class/:classroomId", getAssignmentsForClass);
    app.post("/api/assignments/:id/submit", submitAssignment);
    app.patch("/api/assignments/submissions/:submissionId/grade", gradeSubmission);

    // Error handling middleware
    app.use(errorHandler);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    // Clear all collections
    await Assignment.deleteMany({});
    await AssignmentSubmission.deleteMany({});
    await Classroom.deleteMany({});
    await Subject.deleteMany({});
    await School.deleteMany({});
    await User.deleteMany({});
    await Student.deleteMany({});
});

describe("Assignment Controller", () => {
    let school, teacherUser, studentUser, classroom, subject, student;

    beforeEach(async () => {
        // Create test data
        school = await School.create({
            name: "Test School"
        });

        teacherUser = await User.create({
            name: "Test Teacher",
            email: "teacher@test.com",
            password: "password",
            role: roles.TEACHER,
            school: school._id
        });

        studentUser = await User.create({
            name: "Test Student",
            email: "student@test.com",
            password: "password",
            role: roles.STUDENT,
            school: school._id
        });

        classroom = await Classroom.create({
            school: school._id,
            stage: "jss",
            level: 1,
            section: "A",
            teacher: teacherUser._id,
            capacity: 30
        });

        subject = await Subject.create({
            school: school._id,
            name: "Mathematics",
            code: "MATH101"
        });

        student = await Student.create({
            user: studentUser._id,
            school: school._id,
            classroom: classroom._id,
            firstName: "Test",
            lastName: "Student",
            gender: "Male",
            admissionNumber: "STU001"
        });
    });

    describe("POST /api/assignments - createAssignment", () => {
        it("should create a new assignment successfully", async () => {
            // Set mock user to teacher
            setMockUser({
                _id: teacherUser._id,
                role: roles.TEACHER,
                school: school._id,
                studentProfile: null
            });

            const assignmentData = {
                classroom: classroom._id.toString(),
                subject: subject._id.toString(),
                title: "Test Assignment",
                description: "This is a test assignment",
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
            };

            const response = await request(app)
                .post("/api/assignments")
                .set("Authorization", `Bearer mock-token`)
                .send(assignmentData)
                .expect(201);

            expect(response.body.message).toBe("Assignment created successfully.");
            expect(response.body.data).toHaveProperty("_id");
            expect(response.body.data.title).toBe(assignmentData.title);
            expect(response.body.data.status).toBe("published");
            expect(response.body.data.teacher.toString()).toBe(teacherUser._id.toString());
        });

        it("should return 400 for missing required fields", async () => {
            const incompleteData = {
                title: "Test Assignment"
                // Missing classroom, subject, description, dueDate
            };

            const response = await request(app)
                .post("/api/assignments")
                .set("Authorization", `Bearer mock-token`)
                .send(incompleteData)
                .expect(400);

            expect(response.body).toHaveProperty("message");
        });
    });

    describe("GET /api/assignments/class/:classroomId - getAssignmentsForClass", () => {
        beforeEach(async () => {
            // Create some test assignments
            await Assignment.create([
                {
                    school: school._id,
                    classroom: classroom._id,
                    subject: subject._id,
                    teacher: teacherUser._id,
                    title: "Assignment 1",
                    description: "First assignment",
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    status: "published"
                },
                {
                    school: school._id,
                    classroom: classroom._id,
                    subject: subject._id,
                    teacher: teacherUser._id,
                    title: "Assignment 2",
                    description: "Second assignment",
                    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    status: "published"
                }
            ]);
        });

        it("should retrieve assignments for a classroom", async () => {
            const response = await request(app)
                .get(`/api/assignments/class/${classroom._id}`)
                .set("Authorization", `Bearer mock-token`)
                .expect(200);

            expect(response.body.message).toBe("Assignments retrieved successfully.");
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data).toHaveLength(2);
            expect(response.body.data[0].title).toBe("Assignment 2"); // Should be sorted by dueDate desc
            expect(response.body.data[1].title).toBe("Assignment 1");
        });

        it("should return empty array for classroom with no assignments", async () => {
            const emptyClassroom = await Classroom.create({
                school: school._id,
                stage: "jss",
                level: 2,
                section: "A",
                teacher: teacherUser._id,
                capacity: 30
            });

            const response = await request(app)
                .get(`/api/assignments/class/${emptyClassroom._id}`)
                .set("Authorization", `Bearer mock-token`)
                .expect(200);

            expect(response.body.message).toBe("Assignments retrieved successfully.");
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data).toHaveLength(0);
        });
    });

    describe("POST /api/assignments/:id/submit - submitAssignment", () => {
        let assignment;

        beforeEach(async () => {
            assignment = await Assignment.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                teacher: teacherUser._id,
                title: "Test Assignment for Submission",
                description: "Submit this assignment",
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: "published"
            });
        });

        it("should submit assignment successfully when on time", async () => {
            // Set mock user to student
            setMockUser({
                _id: studentUser._id,
                role: roles.STUDENT,
                school: school._id,
                studentProfile: student._id
            });

            const submissionData = {
                textSubmission: "This is my assignment submission"
            };

            const response = await request(app)
                .post(`/api/assignments/${assignment._id}/submit`)
                .set("Authorization", `Bearer mock-token`)
                .send(submissionData)
                .expect(201);

            expect(response.body.message).toBe("Assignment submitted successfully.");
            expect(response.body.data).toHaveProperty("_id");
            expect(response.body.data.status).toBe("submitted");
            expect(response.body.data.textSubmission).toBe(submissionData.textSubmission);
        });

        it("should mark submission as late when past due date", async () => {
            // Set mock user to student
            setMockUser({
                _id: studentUser._id,
                role: roles.STUDENT,
                school: school._id,
                studentProfile: student._id
            });

            // Create assignment with past due date
            const pastAssignment = await Assignment.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                teacher: teacherUser._id,
                title: "Past Due Assignment",
                description: "This is past due",
                dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
                status: "published"
            });

            const submissionData = {
                textSubmission: "Late submission"
            };

            const response = await request(app)
                .post(`/api/assignments/${pastAssignment._id}/submit`)
                .set("Authorization", `Bearer mock-token`)
                .send(submissionData)
                .expect(201);

            expect(response.body.data.status).toBe("late");
        });

        it("should return 409 for duplicate submission", async () => {
            // Set mock user to student
            setMockUser({
                _id: studentUser._id,
                role: roles.STUDENT,
                school: school._id,
                studentProfile: student._id
            });

            // First submission
            await AssignmentSubmission.create({
                assignment: assignment._id,
                student: student._id,
                textSubmission: "First submission",
                status: "submitted"
            });

            const submissionData = {
                textSubmission: "Duplicate submission"
            };

            const response = await request(app)
                .post(`/api/assignments/${assignment._id}/submit`)
                .set("Authorization", `Bearer mock-token`)
                .send(submissionData)
                .expect(409);

            expect(response.body.message).toContain("already submitted");
        });

        it("should return 404 for non-existent assignment", async () => {
            // Set mock user to student
            setMockUser({
                _id: studentUser._id,
                role: roles.STUDENT,
                school: school._id,
                studentProfile: student._id
            });

            const fakeId = new mongoose.Types.ObjectId();
            const submissionData = {
                textSubmission: "Submission for fake assignment"
            };

            const response = await request(app)
                .post(`/api/assignments/${fakeId}/submit`)
                .set("Authorization", `Bearer mock-token`)
                .send(submissionData)
                .expect(404);

            expect(response.body.message).toContain("not found");
        });
    });

    describe("PATCH /api/assignments/submissions/:submissionId/grade - gradeSubmission", () => {
        let submission;

        beforeEach(async () => {
            const assignment = await Assignment.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                teacher: teacherUser._id,
                title: "Assignment to Grade",
                description: "Grade this assignment",
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: "published"
            });

            submission = await AssignmentSubmission.create({
                assignment: assignment._id,
                student: student._id,
                textSubmission: "Student submission",
                status: "submitted"
            });
        });

        it("should grade submission successfully", async () => {
            // Set mock user to teacher
            setMockUser({
                _id: teacherUser._id,
                role: roles.TEACHER,
                school: school._id,
                studentProfile: null
            });

            const gradeData = {
                grade: 85,
                feedback: "Good work, but could be more detailed"
            };

            const response = await request(app)
                .patch(`/api/assignments/submissions/${submission._id}/grade`)
                .set("Authorization", `Bearer mock-token`)
                .send(gradeData)
                .expect(200);

            expect(response.body.message).toBe("Submission graded successfully.");
            expect(response.body.data.grade).toBe("85"); // JSON response returns numbers as strings
            expect(response.body.data.feedback).toBe(gradeData.feedback);
            expect(response.body.data.status).toBe("graded");
            expect(response.body.data.gradedBy.toString()).toBe(teacherUser._id.toString());
        });

        it("should return 404 for non-existent submission", async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const gradeData = {
                grade: 90,
                feedback: "Great work!"
            };

            const response = await request(app)
                .patch(`/api/assignments/submissions/${fakeId}/grade`)
                .set("Authorization", `Bearer mock-token`)
                .send(gradeData)
                .expect(404);

            expect(response.body.message).toContain("not found");
        });
    });
});
