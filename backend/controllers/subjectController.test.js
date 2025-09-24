import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import errorHandler from "../middleware/errorMiddleware.js";
import asyncHandler from "express-async-handler";
import AppError from "../utils/AppError.js";

// --- Mocks Setup ---

const mockSubjectInstance = {
  _id: "subject123",
  name: "Mathematics",
  code: "MTH101",
  school: "school123",
  save: jest.fn().mockReturnThis(),
  deleteOne: jest.fn().mockResolvedValue(true),
};

jest.unstable_mockModule("../models/Subject.js", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue(mockSubjectInstance),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockSubjectInstance]),
    }),
    findById: jest.fn().mockResolvedValue(mockSubjectInstance),
    findOne: jest.fn(),
  },
}));

// --- Dynamic Imports & Assumed Controller Implementation ---

const { default: Subject } = await import("../models/Subject.js");
const { roles } = await import("../config/roles.js");

// Since the controller was not provided, here is a standard implementation
// that these tests will validate against.
const subjectController = {
  createSubject: asyncHandler(async (req, res, next) => {
    const { name, code, stageScope, maxMark } = req.body;
    if (!name || !code) return next(new AppError("Name and code are required.", 400));
    const subjectExists = await Subject.findOne({ school: req.user.school, code });
    if (subjectExists) return next(new AppError("A subject with this code already exists.", 400));
    const subject = await Subject.create({ school: req.user.school, name, code, stageScope, maxMark });
    res.status(201).json(subject);
  }),
  getSubjects: asyncHandler(async (req, res) => {
    const subjects = await Subject.find({ school: req.user.school }).sort({ name: 1 });
    res.status(200).json(subjects);
  }),
  updateSubject: asyncHandler(async (req, res, next) => {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return next(new AppError("Subject not found.", 404));
    if (subject.school.toString() !== req.user.school.toString()) {
      return next(new AppError("Forbidden: You can only update subjects for your own school.", 403));
    }
    Object.assign(subject, req.body);
    const updatedSubject = await subject.save();
    res.status(200).json(updatedSubject);
  }),
  deleteSubject: asyncHandler(async (req, res, next) => {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return next(new AppError("Subject not found.", 404));
    if (subject.school.toString() !== req.user.school.toString()) {
      return next(new AppError("Forbidden: You can only delete subjects for your own school.", 403));
    }
    await subject.deleteOne();
    res.status(200).json({ message: "Subject deleted successfully." });
  }),
};

// --- Test Application Setup ---

const app = express();
app.use(express.json());

const mockAuth = (user) => (req, res, next) => {
  req.user = user;
  next();
};

const principalUser = { _id: "principal123", role: roles.PRINCIPAL, school: "school123" };
const otherSchoolPrincipal = { _id: "principal456", role: roles.PRINCIPAL, school: "school456" };

app.post("/api/subjects", mockAuth(principalUser), subjectController.createSubject);
app.get("/api/subjects", mockAuth(principalUser), subjectController.getSubjects);
app.put("/api/subjects/:id", mockAuth(principalUser), subjectController.updateSubject);
app.delete("/api/subjects/:id", mockAuth(principalUser), subjectController.deleteSubject);

app.use(errorHandler);
const request = supertest(app);

describe("Subject Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/subjects", () => {
    it("should create a subject successfully", async () => {
      Subject.findOne.mockResolvedValue(null);
      const res = await request.post("/api/subjects").send({ name: "Physics", code: "PHY101" });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Mathematics"); // From mock instance
    });

    it("should return 400 if subject code already exists for the school", async () => {
      Subject.findOne.mockResolvedValue({ _id: "existing_subject" });
      const res = await request.post("/api/subjects").send({ name: "Physics", code: "PHY101" });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("already exists");
    });
  });

  describe("GET /api/subjects", () => {
    it("should get all subjects for the user's school", async () => {
      const res = await request.get("/api/subjects");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe("Mathematics");
      expect(Subject.find).toHaveBeenCalledWith({ school: principalUser.school });
    });
  });

  describe("PUT /api/subjects/:id", () => {
    it("should update a subject successfully", async () => {
      const res = await request.put("/api/subjects/subject123").send({ name: "Advanced Mathematics" });
      expect(res.status).toBe(200);
      expect(mockSubjectInstance.save).toHaveBeenCalled();
    });

    it("should return 404 if subject not found", async () => {
      Subject.findById.mockResolvedValueOnce(null);
      const res = await request.put("/api/subjects/notfound").send({ name: "Update" });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Subject not found.");
    });

    it("should return 403 if user tries to update a subject from another school", async () => {
        const authFailApp = express();
        authFailApp.use(express.json());
        authFailApp.put("/api/subjects/:id", mockAuth(otherSchoolPrincipal), subjectController.updateSubject);
        authFailApp.use(errorHandler);
        const authFailRequest = supertest(authFailApp);

        const res = await authFailRequest.put("/api/subjects/subject123").send({ name: "Update" });
        expect(res.status).toBe(403);
        expect(res.body.message).toContain("update subjects for your own school");
    });
  });

  describe("DELETE /api/subjects/:id", () => {
    it("should delete a subject successfully", async () => {
      const res = await request.delete("/api/subjects/subject123");
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Subject deleted successfully.");
      expect(mockSubjectInstance.deleteOne).toHaveBeenCalled();
    });
  });
});
