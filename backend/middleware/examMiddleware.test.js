import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import mongoose from "mongoose";

// Mock dependencies before importing the middleware
const mockExamFindById = jest.fn();
jest.unstable_mockModule("../models/Exam.js", () => ({
    __esModule: true,
    default: {
        findById: mockExamFindById,
    },
}));

const AppError = (await import("../utils/AppError.js")).default;
const { roles } = await import("../config/roles.js");

// Dynamically import the middleware to be tested
const { checkExamAccess } = await import("./examMiddleware.js");

describe("checkExamAccess Middleware", () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            params: {},
            user: {},
        };
        res = {}; // Not used by this middleware
        next = jest.fn();
    });

    // Mock Data
    const schoolId1 = new mongoose.Types.ObjectId().toString();
    const schoolId2 = new mongoose.Types.ObjectId().toString();
    const examId = new mongoose.Types.ObjectId().toString();

    const mockExam = {
        _id: examId,
        school: schoolId1,
    };

    const globalAdmin = { role: roles.GLOBAL_SUPER_ADMIN, school: null };
    const school1Teacher = { role: roles.TEACHER, school: schoolId1 };
    const school2Teacher = { role: roles.TEACHER, school: schoolId2 };

    it("should call next() with no error and attach exam to req for a GLOBAL_SUPER_ADMIN", async () => {
        req.params.examId = examId;
        req.user = globalAdmin;
        mockExamFindById.mockResolvedValue(mockExam);

        await checkExamAccess(req, res, next);

        expect(mockExamFindById).toHaveBeenCalledWith(examId);
        expect(req.exam).toBe(mockExam);
        expect(next).toHaveBeenCalledWith();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("should call next() with no error for a user from the same school", async () => {
        req.params.examId = examId;
        req.user = school1Teacher;
        mockExamFindById.mockResolvedValue(mockExam);

        await checkExamAccess(req, res, next);

        expect(req.exam).toBe(mockExam);
        expect(next).toHaveBeenCalledWith();
    });

    it("should call next() with a 403 AppError for a user from a different school", async () => {
        req.params.examId = examId;
        req.user = school2Teacher;
        mockExamFindById.mockResolvedValue(mockExam);

        await checkExamAccess(req, res, next);

        expect(req.exam).toBeUndefined();
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(403);
        expect(error.message).toBe("Forbidden: You do not have access to this exam.");
    });

    it("should call next() with a 404 AppError if the exam is not found", async () => {
        req.params.examId = examId;
        req.user = school1Teacher;
        mockExamFindById.mockResolvedValue(null);

        await checkExamAccess(req, res, next);

        expect(req.exam).toBeUndefined();
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe("Exam not found");
    });

    it("should call next() with a 400 AppError for an invalid examId format", async () => {
        req.params.examId = "invalid-id";
        req.user = school1Teacher;

        await checkExamAccess(req, res, next);

        expect(mockExamFindById).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(400);
        expect(error.message).toBe("Invalid Exam ID format");
    });

    it("should correctly use req.params.id if req.params.examId is not present", async () => {
        req.params.id = examId;
        req.user = school1Teacher;
        mockExamFindById.mockResolvedValue(mockExam);

        await checkExamAccess(req, res, next);

        expect(mockExamFindById).toHaveBeenCalledWith(examId);
        expect(req.exam).toBe(mockExam);
        expect(next).toHaveBeenCalledWith();
    });
});