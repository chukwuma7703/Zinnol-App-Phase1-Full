import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";

// --- Mocks Setup ---

const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn().mockResolvedValue({
  loadLanguage: jest.fn().mockResolvedValue(true),
  initialize: jest.fn().mockResolvedValue(true),
  recognize: mockRecognize,
  terminate: mockTerminate,
});
jest.unstable_mockModule("tesseract.js", () => ({
  createWorker: mockCreateWorker,
}));

const mockToBuffer = jest.fn();
const mockSharpInstance = {
  grayscale: jest.fn().mockReturnThis(),
  sharpen: jest.fn().mockReturnThis(),
  toBuffer: mockToBuffer,
};
const mockSharp = jest.fn(() => mockSharpInstance);
jest.unstable_mockModule("sharp", () => ({
  __esModule: true,
  default: mockSharp,
}));

jest.unstable_mockModule("../models/Student.js", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findByFullName: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/Classroom.js", () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.unstable_mockModule("fs", () => ({
  __esModule: true,
  default: { unlinkSync: jest.fn() },
}));

const mockOcrQueueAdd = jest.fn();
jest.unstable_mockModule("../queues/ocrQueue.js", () => ({
  __esModule: true,
  ocrQueue: {
    add: mockOcrQueueAdd,
  },
}));

// --- Dynamic Imports ---
const studentController = await import("./studentController.js");
const { default: Student } = await import("../models/Student.js");
const { default: Classroom } = await import("../models/Classroom.js");
const fs = (await import("fs")).default;
const { default: errorHandler } = await import("../middleware/errorMiddleware.js");

// --- Test App Setup ---
const app = express();
app.use(express.json());

// Mock authentication middleware for all routes on the main app.
// This is the primary fix for the test failures, as controllers expect `req.user`.
app.use((req, res, next) => {
  req.user = { _id: "user123", school: "school123" };
  next();
});

app.post("/api/students", studentController.createStudent);
app.get("/api/students", studentController.getStudents);
app.delete("/api/students/:id", studentController.deleteStudent);
app.post("/api/students/ocr", studentController.enrollStudentsFromOCR);

app.use(errorHandler);
const request = supertest(app);

describe("Student Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createStudent", () => {
    const studentData = { school: "school123", classroom: "class123", firstName: "John", lastName: "Doe", admissionNumber: "S001", gender: "Male" };

    it("should create a student successfully", async () => {
      Classroom.findById.mockResolvedValue({ _id: "class123", school: "school123", capacity: 30, studentCount: 25 });
      Student.create.mockResolvedValue({ _id: "student123", ...studentData });

      const res = await request.post("/api/students").send(studentData);

      expect(res.status).toBe(201);
      expect(res.body.admissionNumber).toBe("S001");
    });

    it("should return 404 if classroom not found", async () => {
      Classroom.findById.mockResolvedValue(null);
      const res = await request.post("/api/students").send(studentData);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Classroom not found");
    });

    it("should return 400 if classroom is full", async () => {
      Classroom.findById.mockResolvedValue({ _id: "class123", school: "school123", capacity: 30, studentCount: 30 });
      const res = await request.post("/api/students").send(studentData);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Classroom is full (capacity 30)");
    });

    it("should delete uploaded file on error", async () => {
      // Simulate a file upload by adding req.file in a middleware
      const tempApp = express();
      tempApp.use(express.json());
      tempApp.post("/api/students", (req, res, next) => {
        req.file = { path: "/uploads/test.jpg" };
        next();
      }, studentController.createStudent);
      tempApp.use(errorHandler);

      Classroom.findById.mockResolvedValue(null); // Trigger an error

      await supertest(tempApp).post("/api/students").send(studentData);
      expect(fs.unlinkSync).toHaveBeenCalledWith("/uploads/test.jpg");
    });
  });

  describe("getStudents", () => {
    it("should get students filtered by school and classroom", async () => {
      Student.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ firstName: "Jane" }]),
      });
      Student.countDocuments.mockResolvedValue(1); // Mock the count
      const res = await request.get("/api/students?school=school123&classroom=class123");

      expect(res.status).toBe(200);
      expect(Student.find).toHaveBeenCalledWith({ school: "school123", classroom: "class123" }); // The initial query
      expect(res.body.data.students[0].firstName).toBe("Jane");
    });

    it("should search for students using the 'q' parameter", async () => {
      Student.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ fullName: "John Doe" }]),
      });
      Student.countDocuments.mockResolvedValue(1); // Mock the count
      const res = await request.get("/api/students?school=school123&q=John");

      expect(res.status).toBe(200);
      expect(Student.find).toHaveBeenCalledWith({
        school: "school123",
        $or: [{ firstName: /John/i }, { lastName: /John/i }, { admissionNumber: /John/i }],
      });
    });
  });

  describe("deleteStudent", () => {
    it("should delete a student successfully", async () => {
      // The controller uses findById then deleteOne. So we mock findById.
      Student.findById.mockResolvedValue({
        _id: "student123",
        school: "school123",
        deleteOne: jest.fn().mockResolvedValue(true),
      });
      const res = await request.delete("/api/students/student123");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Student deleted successfully");
    });

    it("should return 404 if student to delete is not found", async () => {
      Student.findById.mockResolvedValue(null);
      const res = await request.delete("/api/students/notfound");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Student not found");
    });
  });

  describe("enrollStudentsFromOCR", () => {
    const mockFile = { buffer: Buffer.from("fake-image") };
    let ocrApp;

    beforeEach(() => {
      // Setup mocks for a successful OCR run
      mockToBuffer.mockResolvedValue(Buffer.from("processed-image"));
      Classroom.findById.mockResolvedValue({ _id: "class123", school: "school123" });

      // We need to use a custom app setup for these tests
      ocrApp = express();
      ocrApp.use(express.json()); // Use JSON parser
      // Mock the protect middleware for this route
      ocrApp.use((req, res, next) => {
        req.user = { _id: "teacher_id", school: "school123" };
        // Manually attach the mock file if the test isn't about missing files
        if (!req.headers['x-test-no-file']) {
            req.file = mockFile;
        }
        next();
      });
      ocrApp.post("/api/students/ocr", studentController.enrollStudentsFromOCR);
      ocrApp.use(errorHandler);
    });

    it("should add a job to the OCR queue and return 202 on success", async () => {
      const res = await supertest(ocrApp).post("/api/students/ocr").send({ classroomId: "class123" });

      expect(res.status).toBe(202);
      expect(res.body.message).toContain("Processing has started in the background");
      expect(mockOcrQueueAdd).toHaveBeenCalledWith('process-class-list', expect.any(Object));
    });

    it("should return 400 if no image is uploaded", async () => {
      const res = await supertest(ocrApp).post("/api/students/ocr").set('x-test-no-file', 'true').send({ classroomId: "class123" });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("No image file was uploaded.");
    });

    it("should return 404 if classroom is not found", async () => {
      Classroom.findById.mockResolvedValue(null);
      const res = await supertest(ocrApp).post("/api/students/ocr").send({ classroomId: "class123" });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Classroom not found.");
      // The mock file has no path, so unlink should not be called.
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it("should return 400 if classroomId is missing", async () => {
      // Send request without classroomId field
      const res = await supertest(ocrApp).post("/api/students/ocr").send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("A classroomId is required.");
      // The mock file has no path, so unlink should not be called.
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});
