import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import { createSchool, getSchools, getSchoolById } from "../controllers/schoolController.js";
import School from "../models/School.js";
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
            role: roles.GLOBAL_SUPER_ADMIN,
            school: null
        };
        next();
    });

    // Mock middleware for getSchoolById
    app.use('/api/schools/:id', (req, res, next) => {
        if (req.params.id === "507f1f77bcf86cd799439012") {
            req.school = {
                _id: "507f1f77bcf86cd799439012",
                name: "Test School",
                address: "123 Test St",
                mainSuperAdmins: []
            };
        }
        // For other IDs, req.school remains undefined
        next();
    });

    // Set up routes
    app.post("/api/schools", createSchool);
    app.get("/api/schools", getSchools);
    app.get("/api/schools/:id", getSchoolById);

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

describe("School Controller", () => {
    describe("createSchool", () => {
        it("should create a school successfully for GLOBAL_SUPER_ADMIN", async () => {
            const schoolData = {
                name: "Test School",
                address: "123 Test St",
                phone: "123-456-7890",
                numberOfStudents: 100,
                numberOfTeachers: 10
            };

            School.create = jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                ...schoolData
            });

            const res = await request(app)
                .post("/api/schools")
                .send(schoolData);

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty("message", "School created successfully");
            expect(res.body).toHaveProperty("school");
            expect(School.create).toHaveBeenCalledWith(schoolData);
        });

        it("should create a school and assign MAIN_SUPER_ADMIN as owner", async () => {
            // Create a separate app instance for MAIN_SUPER_ADMIN test
            const mainAdminApp = express();
            mainAdminApp.use(express.json());

            // Mock authentication middleware for MAIN_SUPER_ADMIN
            mainAdminApp.use((req, res, next) => {
                req.user = {
                    _id: "507f1f77bcf86cd799439011",
                    role: roles.MAIN_SUPER_ADMIN,
                    school: null
                };
                next();
            });

            mainAdminApp.post("/api/schools", createSchool);
            mainAdminApp.use(errorHandler);

            const schoolData = {
                name: "Test School 2",
                address: "456 Test Ave"
            };

            const expectedData = {
                ...schoolData,
                phone: undefined,
                numberOfStudents: 0,
                numberOfTeachers: 0,
                mainSuperAdmins: ["507f1f77bcf86cd799439011"]
            };

            School.create = jest.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439013",
                ...expectedData
            });

            const res = await request(mainAdminApp)
                .post("/api/schools")
                .send(schoolData);

            expect(res.status).toBe(201);
            expect(School.create).toHaveBeenCalledWith(expectedData);
        });

        it("should return 400 if school name is missing", async () => {
            const res = await request(app)
                .post("/api/schools")
                .send({ address: "123 Test St" });

            expect(res.status).toBe(400);
        });
    });

    describe("getSchools", () => {
        it("should return all schools with populated mainSuperAdmins", async () => {
            const mockSchools = [
                {
                    _id: "507f1f77bcf86cd799439012",
                    name: "School A",
                    mainSuperAdmins: [
                        { name: "Admin 1", email: "admin1@test.com" }
                    ]
                },
                {
                    _id: "507f1f77bcf86cd799439013",
                    name: "School B",
                    mainSuperAdmins: [
                        { name: "Admin 2", email: "admin2@test.com" }
                    ]
                }
            ];

            School.find = jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockSchools)
            });

            const res = await request(app)
                .get("/api/schools");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("schools");
            expect(res.body.schools).toHaveLength(2);
            expect(School.find).toHaveBeenCalledWith({});
        });
    });

    describe("getSchoolById", () => {
        it("should return a school by ID", async () => {
            const res = await request(app)
                .get("/api/schools/507f1f77bcf86cd799439012");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                _id: "507f1f77bcf86cd799439012",
                name: "Test School",
                address: "123 Test St",
                mainSuperAdmins: []
            });
        });

        it("should return undefined if school not found", async () => {
            const res = await request(app)
                .get("/api/schools/nonexistent");

            expect(res.status).toBe(200);
            expect(res.body).toBe("");
        });
    });
});
