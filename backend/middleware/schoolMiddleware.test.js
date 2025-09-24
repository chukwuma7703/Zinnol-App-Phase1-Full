import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import errorHandler from "./errorMiddleware.js";

// Mock models before any other imports
jest.unstable_mockModule("../models/School.js", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));
jest.unstable_mockModule("../models/userModel.js", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

// Dynamically import modules after mocks are set up
const { default: School } = await import("../models/School.js");
const { default: User } = await import("../models/userModel.js");
const { checkSchoolAccess, checkStudentAccess } = await import("./schoolMiddleware.js");
const { roles } = await import("../config/roles.js");

// --- Test App Setup ---

// Helper to create a test app with a specific user context
const createAppForUser = (user) => {
    const app = express();
    // Mock middleware to attach the user to the request
    app.use((req, res, next) => {
        req.user = user;
        next();
    });
    // Define test routes that use the middleware
    app.get("/schools/:id/access", checkSchoolAccess, (req, res) => res.status(200).json({ school: req.school }));
    app.get("/schools/:id/students/:studentId", checkSchoolAccess, checkStudentAccess, (req, res) => res.status(200).json({ student: req.student }));
    app.get("/students/:studentId/no-school-check", checkStudentAccess, (req, res) => res.status(200).json({ student: req.student }));
    app.use(errorHandler);
    return supertest(app);
};

// --- Test Suite ---

describe("School Middleware", () => {
    // Mock Data
    const schoolId1 = "60d0fe4f5311236168a109ca";
    const schoolId2 = "60d0fe4f5311236168a109cb";
    const mainAdminId1 = "60d0fe4f5311236168a109cc";
    const studentId1 = "60d0fe4f5311236168a109cd";

    const mockSchool1 = { _id: schoolId1, name: "School One", mainSuperAdmins: [mainAdminId1] };
    const mockStudent1 = { _id: studentId1, name: "Student One", school: schoolId1 };

    const globalAdmin = { _id: "globaladminid", role: roles.GLOBAL_SUPER_ADMIN, school: null };
    const mainAdminOwner = { _id: mainAdminId1, role: roles.MAIN_SUPER_ADMIN, school: schoolId1 };
    const mainAdminNonOwner = { _id: "mainadmin222", role: roles.MAIN_SUPER_ADMIN, school: schoolId2 };
    const principalSchool1 = { _id: "principal111", role: roles.PRINCIPAL, school: schoolId1 };
    const principalSchool2 = { _id: "principal222", role: roles.PRINCIPAL, school: schoolId2 };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("checkSchoolAccess", () => {
        it("should grant access to a GLOBAL_SUPER_ADMIN for any school", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            const request = createAppForUser(globalAdmin);
            const res = await request.get(`/schools/${schoolId1}/access`);
            expect(res.status).toBe(200);
            expect(res.body.school._id).toBe(schoolId1);
        });

        it("should grant access to a MAIN_SUPER_ADMIN for a school they own", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            const request = createAppForUser(mainAdminOwner);
            const res = await request.get(`/schools/${schoolId1}/access`);
            expect(res.status).toBe(200);
        });

        it("should deny access to a MAIN_SUPER_ADMIN for a school they do not own", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            const request = createAppForUser(mainAdminNonOwner);
            const res = await request.get(`/schools/${schoolId1}/access`);
            expect(res.status).toBe(403);
            expect(res.body.message).toBe("Forbidden: You are not an owner of this school.");
        });

        it("should grant access to a school-level user (Principal) for their own school", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            const request = createAppForUser(principalSchool1);
            const res = await request.get(`/schools/${schoolId1}/access`);
            expect(res.status).toBe(200);
        });

        it("should deny access to a school-level user (Principal) for a different school", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            const request = createAppForUser(principalSchool2);
            const res = await request.get(`/schools/${schoolId1}/access`);
            expect(res.status).toBe(403);
            expect(res.body.message).toBe("Forbidden: You can only manage your own school.");
        });

        it("should return 404 if the school does not exist", async () => {
            School.findById.mockResolvedValue(null);
            const request = createAppForUser(globalAdmin);
            const res = await request.get(`/schools/nonexistentid/access`);
            expect(res.status).toBe(404);
            expect(res.body.message).toBe("School not found");
        });
    });

    describe("checkStudentAccess", () => {
        it("should grant access if student belongs to the school", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            User.findById.mockResolvedValue(mockStudent1);
            const request = createAppForUser(principalSchool1);
            const res = await request.get(`/schools/${schoolId1}/students/${studentId1}`);
            expect(res.status).toBe(200);
            expect(res.body.student._id).toBe(studentId1);
        });

        it("should return 404 if student is not found", async () => {
            School.findById.mockResolvedValue(mockSchool1);
            User.findById.mockResolvedValue(null);
            const request = createAppForUser(principalSchool1);
            const res = await request.get(`/schools/${schoolId1}/students/nonexistentid`);
            expect(res.status).toBe(404);
            expect(res.body.message).toBe("Student not found in this school.");
        });

        it("should return 500 if checkSchoolAccess has not run first", async () => {
            const request = createAppForUser(principalSchool1);
            const res = await request.get(`/students/${studentId1}/no-school-check`);
            expect(res.status).toBe(500);
            expect(res.body.message).toBe("Server configuration error: checkSchoolAccess must be used before checkStudentAccess.");
        });
    });
});
