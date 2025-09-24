import express from "express";
import supertest from "supertest";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock models and middleware before importing the router
jest.unstable_mockModule("../models/Classroom.js", () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
        insertMany: jest.fn(),
        find: jest.fn(),
    },
}));

// Dynamically import modules after mocks are defined
const { default: classRoutes } = await import("./classRoutes.js");
const { default: Classroom } = await import("../models/Classroom.js");
const { roles } = await import("../middleware/authMiddleware.js");
const { default: errorHandler } = await import("../middleware/errorMiddleware.js");

// Setup mock express app
const app = express();
app.use(express.json());

// Mock the `protect` middleware to inject a user into the request
const mockAuth = (user) => (req, res, next) => {
    req.user = user;
    next();
};

// --- Mock Data ---
const schoolId_A = "school_A_12345678901234567890";
const schoolId_B = "school_B_12345678901234567890";

const globalAdmin = { _id: "global_admin_id", role: roles.GLOBAL_SUPER_ADMIN, school: null };
const principalA = { _id: "principal_A_id", role: roles.PRINCIPAL, school: schoolId_A };
const teacherA = { _id: "teacher_A_id", role: roles.TEACHER, school: schoolId_A };

// Setup routes with mock authentication
// We need to re-wire the app for each user role we want to test
const createAppForUser = (user) => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use("/api/classes", mockAuth(user), classRoutes);
    testApp.use(errorHandler);
    return supertest(testApp);
};

describe("Classroom Routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("POST / (Create Single Classroom)", () => {
        const classroomData = { school: schoolId_A, stage: "jss", level: 1, section: "A" };

        it("should allow a PRINCIPAL to create a classroom for their own school", async () => {
            const request = createAppForUser(principalA);
            Classroom.create.mockResolvedValue({ _id: "new_class_id", ...classroomData });

            const res = await request.post("/api/classes").send(classroomData);

            expect(res.status).toBe(201);
            expect(res.body.stage).toBe("jss");
            expect(Classroom.create).toHaveBeenCalledWith({ ...classroomData, school: principalA.school });
        });

        it("should deny a PRINCIPAL from creating a classroom for another school (IDOR check)", async () => {
            const request = createAppForUser(principalA);
            const otherSchoolClassData = { ...classroomData, school: schoolId_B, level: 1, section: "A" };
            Classroom.create.mockResolvedValue({ _id: "new_class_id", ...otherSchoolClassData, school: schoolId_A });

            const res = await request.post("/api/classes").send(otherSchoolClassData);

            expect(res.status).toBe(201);
            // The controller should securely override the school ID with the user's own school ID.
            expect(Classroom.create).toHaveBeenCalledWith({ ...otherSchoolClassData, school: principalA.school });
        });

        it("should allow a GLOBAL_SUPER_ADMIN to create a classroom for any school", async () => {
            const request = createAppForUser(globalAdmin);
            const otherSchoolClassData = { ...classroomData, school: schoolId_B };
            Classroom.create.mockResolvedValue({ _id: "new_class_id", ...otherSchoolClassData });

            const res = await request.post("/api/classes").send(otherSchoolClassData);

            expect(res.status).toBe(201);
            expect(Classroom.create).toHaveBeenCalledWith(otherSchoolClassData);
        });

        it("should return 403 for a user with an unauthorized role (e.g., TEACHER)", async () => {
            const request = createAppForUser(teacherA);
            const res = await request.post("/api/classes").send(classroomData);

            expect(res.status).toBe(403);
            expect(res.body.message).toContain("Forbidden: Access denied.");
        });
    });

    describe("POST /bulk (Bulk Create Classrooms)", () => {
        const bulkData = { school: schoolId_A, stage: "primary", level: 1 };

        it("should allow a PRINCIPAL to bulk create classrooms", async () => {
            const request = createAppForUser(principalA);
            const createdDocs = [{ _id: "class1" }, { _id: "class2" }];
            Classroom.insertMany.mockResolvedValue(createdDocs);

            const res = await request.post("/api/classes/bulk").send(bulkData);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe(`Successfully created ${createdDocs.length} classrooms.`);
            expect(Classroom.insertMany).toHaveBeenCalledWith(expect.any(Array), { ordered: false });
        });

        it("should handle partial success with a 207 status on BulkWriteError", async () => {
            const request = createAppForUser(principalA);
            const bulkWriteError = new Error("Bulk write error");
            bulkWriteError.name = "BulkWriteError";
            bulkWriteError.code = 11000; // Duplicate key error code
            bulkWriteError.result = { nInserted: 8 };
            bulkWriteError.writeErrors = [
                { err: { op: { stage: "primary", level: 1, section: "I" }, errmsg: "Duplicate key" } },
                { err: { op: { stage: "primary", level: 1, section: "J" }, errmsg: "Duplicate key" } },
            ];
            Classroom.insertMany.mockRejectedValue(bulkWriteError);

            const res = await request.post("/api/classes/bulk").send(bulkData);

            expect(res.status).toBe(207);
            expect(res.body.message).toBe("Bulk operation completed with partial success. Created: 8, Failed: 2.");
            expect(res.body.failedCount).toBe(2);
        });
    });

    describe("GET / (Get Classrooms)", () => {
        it("should allow a TEACHER to get a list of classrooms", async () => {
            const request = createAppForUser(teacherA);
            const mockClasses = [{ _id: "class1", name: "JSS 1A" }];
            Classroom.find.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockClasses) });

            const res = await request.get("/api/classes");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockClasses);
            expect(Classroom.find).toHaveBeenCalledWith({});
        });

        it("should filter classrooms by stage and grade", async () => {
            const request = createAppForUser(principalA);
            Classroom.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });

            await request.get(`/api/classes?school=${schoolId_A}&stage=jss&level=2`);

            expect(Classroom.find).toHaveBeenCalledWith({ school: schoolId_A, stage: "jss", level: 2 });
        });
    });
});
