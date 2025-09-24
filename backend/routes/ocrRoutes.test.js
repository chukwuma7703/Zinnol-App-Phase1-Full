import { jest, describe, it, expect, beforeEach, afterAll, beforeAll } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";


// Mock dependencies before importing the router
const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn();

jest.unstable_mockModule("tesseract.js", () => ({
    createWorker: mockCreateWorker,
}));

const mockToBuffer = jest.fn();
const mockSharpInstance = {
    resize: jest.fn().mockReturnThis(),
    grayscale: jest.fn().mockReturnThis(),
    sharpen: jest.fn().mockReturnThis(),
    toBuffer: mockToBuffer,
};
const mockSharp = jest.fn(() => mockSharpInstance);

jest.unstable_mockModule("sharp", () => ({
    __esModule: true,
    default: mockSharp,
}));

const mockUnlink = jest.fn();
jest.unstable_mockModule("fs/promises", () => ({
    __esModule: true,
    default: {
        unlink: mockUnlink,
    },
}));

// Dynamically import the router
const { default: ocrRoutes } = await import("./ocrRoutes.js");

// Setup Express app
const app = express();
app.use(express.json());
app.use("/api/ocr", ocrRoutes);

const request = supertest(app);

// --- Test Suite ---
describe("OCR Routes", () => {
    // Get directory name for ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Create a dummy file for testing uploads
    const testImagePath = path.join(__dirname, "test-image.png");
    const uploadsDir = path.join(process.cwd(), "uploads");

    beforeAll(() => {
        // Ensure uploads directory exists for multer
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        // Create a dummy file to be uploaded
        fs.writeFileSync(testImagePath, "dummy image content");
    });

    afterAll(() => {
        // Clean up the dummy file
        fs.unlinkSync(testImagePath);
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Default successful mock implementations
        mockCreateWorker.mockResolvedValue({
            loadLanguage: jest.fn().mockResolvedValue(true),
            initialize: jest.fn().mockResolvedValue(true),
            recognize: mockRecognize.mockResolvedValue({ data: { text: "mocked OCR text" } }),
            terminate: mockTerminate.mockResolvedValue(true),
        });
        mockToBuffer.mockResolvedValue(Buffer.from("processed image data"));
        mockUnlink.mockResolvedValue(true);
    });

    it("should process an image and return extracted text on success", async () => {
        const response = await request.post("/api/ocr").attach("image", testImagePath);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ text: "mocked OCR text" });

        // Verify mocks were called
        expect(mockCreateWorker).toHaveBeenCalledTimes(1);
        expect(mockSharp).toHaveBeenCalled();
        expect(mockRecognize).toHaveBeenCalledWith(Buffer.from("processed image data"));
        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(mockUnlink).toHaveBeenCalledTimes(1); // Check that cleanup happened
    });

    it("should return 400 if no image is uploaded", async () => {
        const response = await request.post("/api/ocr"); // No .attach()

        expect(response.status).toBe(400);
        expect(response.text).toBe("No image uploaded.");
        expect(mockCreateWorker).not.toHaveBeenCalled();
    });

    it("should return 500 if Tesseract.js fails during recognition", async () => {
        mockRecognize.mockRejectedValue(new Error("Tesseract failed"));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const response = await request.post("/api/ocr").attach("image", testImagePath);

        expect(response.status).toBe(500);
        expect(response.text).toBe("Error processing image.");
        expect(consoleErrorSpy).toHaveBeenCalledWith("OCR or image processing error:", expect.any(Error));
        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(mockUnlink).toHaveBeenCalledTimes(1);
        consoleErrorSpy.mockRestore();

    });

    it("should return 500 if sharp fails during preprocessing", async () => {
        mockToBuffer.mockRejectedValue(new Error("Sharp failed"));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const response = await request.post("/api/ocr").attach("image", testImagePath);

        expect(response.status).toBe(500);
        expect(response.text).toBe("Error processing image.");
        expect(consoleErrorSpy).toHaveBeenCalledWith("OCR or image processing error:", expect.any(Error));
        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(mockUnlink).toHaveBeenCalledTimes(1);
        consoleErrorSpy.mockRestore();

    });

    it("should still attempt cleanup even if file unlink fails in the finally block", async () => {
        mockUnlink.mockRejectedValue(new Error("Permission denied"));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await request.post("/api/ocr").attach("image", testImagePath);

        expect(mockTerminate).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error during resource cleanup:", expect.any(Error));
        consoleErrorSpy.mockRestore();
    });
});


