import { jest, describe, it, expect, beforeEach } from "@jest/globals";


// --- Mocking Dependencies ---
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

const mockResultFindOneAndUpdate = jest.fn();
jest.unstable_mockModule("../models/Result.js", () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: mockResultFindOneAndUpdate,
  },
}));

const mockStudentFindOne = jest.fn();
jest.unstable_mockModule("../models/Student.js", () => ({
  __esModule: true,
  default: {
    findOne: mockStudentFindOne,
  },
}));

// Dynamically import the controller after mocks are set up
const { submitResultsFromOCR } = await import("./resultController.js");
const { default: AppError } = await import("../utils/AppError.js");

// --- Test Suite ---
describe("submitResultsFromOCR", () => {
  let req, res, next;
  const schoolId = "school_id";

  // --- Reusable Mock Data and Setup ---
  const validReqBody = {
    classroomId: "class123",
    session: "2023/2024",
    term: "1",
    subjectOrderJSON: '["math_id", "eng_id"]',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      file: { buffer: Buffer.from("fake-image-data") },
      body: { ...validReqBody },
      user: { _id: "teacher_id", school: schoolId },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    mockToBuffer.mockResolvedValue(Buffer.from("processed-image-data"));
  });

  // -------------------------------------------------------------------------
  // ## Input Validation & File Handling
  // -------------------------------------------------------------------------
  describe("Input Validation & File Handling", () => {
    it("should return 400 if no image file is uploaded", async () => {
      req.file = null;
      await submitResultsFromOCR(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: "No image file was uploaded." })
      );
    });

    it("should return 400 if any required body field is missing", async () => {
      delete req.body.classroomId;
      await submitResultsFromOCR(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: expect.stringContaining("Missing required fields") })
      );
    });

    it("should throw a Tesseract.js error if image processing fails", async () => {
      mockToBuffer.mockRejectedValue(new Error("Image processing failed"));
      await submitResultsFromOCR(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, message: "Image processing failed" })
      );
    });
  });

  // -------------------------------------------------------------------------
  // ## OCR Parsing and Record Processing
  // -------------------------------------------------------------------------
  describe("OCR Parsing and Record Processing", () => {
    it("should return 400 if OCR text contains no valid data", async () => {
      mockRecognize.mockResolvedValue({ data: { text: "This text has no valid data." } });      
      await submitResultsFromOCR(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: expect.stringContaining("No valid student results could be extracted") })
      );
    });

    it("should handle a mix of successful, failed, and invalid records", async () => {
      const ocrText =
        "ZNL-001 30 65\n" + // Success
        "ZNL-002 150 50\n" + // Failed (Validation Error)
        "ZNL-999 25 55\n" +  // Failed (Student not found)
        "Invalid Line"; // Failed (Parsing Error)

      mockRecognize.mockResolvedValue({ data: { text: ocrText } });

      req.body.subjectOrderJSON = '["math_id"]';


      mockStudentFindOne
        .mockResolvedValueOnce({ _id: "student1", admissionNumber: "ZNL-001", school: schoolId })
        .mockResolvedValueOnce({ _id: "student2", admissionNumber: "ZNL-002", school: schoolId })
        .mockResolvedValueOnce(null); // ZNL-999 not found

      mockResultFindOneAndUpdate
        .mockResolvedValueOnce({ _id: "result1" })
        .mockRejectedValueOnce(new Error("CA score for math_id exceeds max of 40"));

      await submitResultsFromOCR(req, res, next);

      expect(res.status).toHaveBeenCalledWith(207);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("processed"),
          summary: { successful: 1, failed: 2, parsingErrors: 1 },
          details: {
            processedResults: expect.arrayContaining([
              expect.objectContaining({ admissionNumber: "ZNL-001", status: "success" }),
              expect.objectContaining({ admissionNumber: "ZNL-002", status: "failed" }),
              expect.objectContaining({ admissionNumber: "ZNL-999", status: "failed" }),
            ]),
            parsingErrors: expect.arrayContaining([
              expect.objectContaining({ text: "Invalid Line", message: expect.stringContaining("Could not find") }),
            ]),
          },
        })
      );
      expect(mockStudentFindOne).toHaveBeenCalledTimes(3);
      expect(mockResultFindOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it("should handle a fully successful upload with multiple records", async () => {
      // The OCR text must match the number of subjects (2) with scores (CA and Exam) for each.
      const ocrText = "ZNL-001 30 60 35 50\nZNL-002 25 55 29 61";
      
      mockRecognize.mockResolvedValue({ data: { text: ocrText } });
      req.body.subjectOrderJSON = '["math_id", "eng_id"]';
      
      mockStudentFindOne
        .mockResolvedValueOnce({ _id: "student1", admissionNumber: "ZNL-001", school: schoolId })
        .mockResolvedValueOnce({ _id: "student2", admissionNumber: "ZNL-002", school: schoolId });
      mockResultFindOneAndUpdate.mockResolvedValueOnce({ _id: "result1" }).mockResolvedValueOnce({ _id: "result2" });

      await submitResultsFromOCR(req, res, next);
      expect(res.status).toHaveBeenCalledWith(207);
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.summary.successful).toBe(2);
      expect(responseBody.summary.failed).toBe(0);
      expect(responseBody.summary.parsingErrors).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // ## Authorization
  // -------------------------------------------------------------------------
  describe("Authorization", () => {
    it("should return 403 if teacher's school ID does not match student's school ID", async () => {
      const ocrText = "ZNL-001 30 60";
      req.user.school = "different_school_id";
      req.body.subjectOrderJSON = '["math_id"]';
      mockRecognize.mockResolvedValue({ data: { text: ocrText } });
      mockStudentFindOne.mockResolvedValueOnce({
        _id: "student1",
        admissionNumber: "ZNL-001",
        school: schoolId, // Student belongs to 'school_id'
      });
      await submitResultsFromOCR(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403, message: "Unauthorized: Teacher does not belong to the same school as the student." })
      );
    });
  });

  // -------------------------------------------------------------------------
  // ## Resource Cleanup
  // -------------------------------------------------------------------------
  describe("Resource Cleanup", () => {
    it("should always terminate the Tesseract worker, even on errors", async () => {
      mockRecognize.mockRejectedValue(new Error("OCR failed catastrophically"));
      await submitResultsFromOCR(req, res, next);
      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
  });
});
