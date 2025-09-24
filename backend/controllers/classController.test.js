import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import { createClassroom, getClassrooms, updateClassroom, deleteClassroom } from "../controllers/classController.js";
import Classroom from "../models/Classroom.js";
import User from "../models/userModel.js";
import { roles } from "../config/roles.js";
import errorHandler from "../middleware/errorMiddleware.js";

let mongoServer;
let app;

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
            role: roles.PRINCIPAL,
            school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")
        };
        next();
    });

    // Set up routes
    app.post("/api/classes", createClassroom);
    app.get("/api/classes", getClassrooms);
    app.put("/api/classes/:id", updateClassroom);
    app.delete("/api/classes/:id", deleteClassroom);

    // Error handling middleware
    app.use(errorHandler);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("Class Controller", () => {
    describe("createClassroom", () => {
        it("should create a classroom successfully", async () => {
            // Mock User.findOne to return a valid teacher
            User.findOne = jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                name: "John Doe",
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
                role: roles.TEACHER
            });

            // Mock Classroom.create
            Classroom.create = jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439013",
                label: "JSS 1A",
                stage: "jss",
                level: 1,
                section: "A",
                teacher: "507f1f77bcf86cd799439012",
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")
            });

            const res = await request(app)
                .post("/api/classes")
                .send({
                    name: "JSS 1A",
                    level: "jss1",
                    teacherId: "507f1f77bcf86cd799439012"
                });

            expect(res.status).toBe(201);
            expect(Classroom.create).toHaveBeenCalledWith({
                label: "JSS 1A",
                stage: "jss",
                level: 1,
                section: "A",
                teacher: "507f1f77bcf86cd799439012",
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")
            });
        });

        it("should return 400 if required fields are missing", async () => {
            const res = await request(app)
                .post("/api/classes")
                .send({ name: "JSS 1A" }); // Missing level and teacherId

            expect(res.status).toBe(400);
        });

        it("should return 404 if teacher not found", async () => {
            // Mock User.findOne to return null
            User.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .post("/api/classes")
                .send({
                    name: "JSS 1A",
                    level: "jss1",
                    teacherId: "507f1f77bcf86cd799439012"
                });

            expect(res.status).toBe(404);
            expect(User.findOne).toHaveBeenCalledWith({
                _id: "507f1f77bcf86cd799439012",
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
                role: roles.TEACHER
            });
        });
    });

    describe("getClassrooms", () => {
        it("should return classrooms with pagination", async () => {
            // Mock Classroom.countDocuments
            Classroom.countDocuments = jest.fn().mockResolvedValue(5);

            // Mock Classroom.find with chainable methods
            Classroom.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                sort: jest.fn().mockResolvedValue([
                    {
                        _id: "507f1f77bcf86cd799439013",
                        label: "JSS 1A",
                        stage: "jss",
                        level: 1,
                        section: "A",
                        teacher: { name: "John Doe" },
                        school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")
                    }
                ])
            });

            const res = await request(app)
                .get("/api/classes?page=1&limit=10");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("classes");
            expect(res.body).toHaveProperty("page", 1);
            expect(res.body).toHaveProperty("pages", 1);
            expect(res.body).toHaveProperty("total", 5);
            expect(Classroom.find).toHaveBeenCalledWith({
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")
            });
        });

        it("should filter classrooms by search query", async () => {
            Classroom.countDocuments = jest.fn().mockResolvedValue(1);
            Classroom.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                sort: jest.fn().mockResolvedValue([
                    {
                        _id: "507f1f77bcf86cd799439013",
                        label: "JSS 1A",
                        stage: "jss",
                        level: 1,
                        section: "A",
                        teacher: { name: "John Doe" }
                    }
                ])
            });

            const res = await request(app)
                .get("/api/classes?q=JSS");

            expect(res.status).toBe(200);
            expect(Classroom.find).toHaveBeenCalledWith({
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
                label: { $regex: "JSS", $options: "i" }
            });
        });
    });

    describe("updateClassroom", () => {
        it("should update classroom successfully", async () => {
            // Mock Classroom.findOne to return existing classroom
            const mockClassroom = {
                _id: "507f1f77bcf86cd799439013",
                label: "JSS 1A",
                stage: "jss",
                level: 1,
                section: "A",
                teacher: "507f1f77bcf86cd799439012",
                school: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
                save: jest.fn().mockResolvedValue({
                    _id: "507f1f77bcf86cd799439013",
                    label: "JSS 1B",
                    stage: "jss",
                    level: 1,
                    section: "B",
                    teacher: "507f1f77bcf86cd799439012",
                    populate: jest.fn().mockResolvedValue({
                        _id: "507f1f77bcf86cd799439013",
                        label: "JSS 1B",
                        stage: "jss",
                        level: 1,
                        section: "B",
                        teacher: { name: "John Doe" }
                    })
                })
            };

            Classroom.findOne = jest.fn().mockResolvedValue(mockClassroom);
            User.findOne = jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                name: "John Doe",
                role: roles.TEACHER
            });

            const res = await request(app)
                .put("/api/classes/507f1f77bcf86cd799439013")
                .send({
                    name: "JSS 1B",
                    level: "jss1",
                    teacherId: "507f1f77bcf86cd799439012"
                });

            expect(res.status).toBe(200);
            expect(mockClassroom.save).toHaveBeenCalled();
            expect(mockClassroom.label).toBe("JSS 1B");
        });

        it("should return 404 if classroom not found", async () => {
            Classroom.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .put("/api/classes/507f1f77bcf86cd799439013")
                .send({
                    name: "JSS 1B",
                    level: "jss1",
                    teacherId: "507f1f77bcf86cd799439012"
                });

            expect(res.status).toBe(404);
        });
    });

    describe("deleteClassroom", () => {
        it("should delete classroom successfully", async () => {
            const mockClassroom = {
                _id: "507f1f77bcf86cd799439013",
                label: "JSS 1A",
                deleteOne: jest.fn().mockResolvedValue({})
            };

            Classroom.findOne = jest.fn().mockResolvedValue(mockClassroom);

            const res = await request(app)
                .delete("/api/classes/507f1f77bcf86cd799439013");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("message", "Classroom removed successfully.");
            expect(mockClassroom.deleteOne).toHaveBeenCalled();
        });

        it("should return 404 if classroom not found", async () => {
            Classroom.findOne = jest.fn().mockResolvedValue(null);

            const res = await request(app)
                .delete("/api/classes/507f1f77bcf86cd799439013");

            expect(res.status).toBe(404);
        });
    });
});
