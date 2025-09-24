import express from "express";
import { createWorker } from "tesseract.js";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

const router = express.Router();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: "./uploads/",
    filename: function (req, file, cb) {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage: storage });

// OCR endpoint with image preprocessing
router.post("/", upload.single("image"), async (req, res) => {
    if (!req.file) {
        return res.status(400).send("No image uploaded.");
    }

    // Declare worker and file paths outside of the try block so they are accessible
    // in the catch and finally blocks.
    let worker;
    const uploadedFilePath = req.file.path;
    
    try {
        // createWorker is async in tesseract.js v5
        worker = await createWorker();
        await worker.loadLanguage("eng");
        await worker.initialize("eng");
    

        // 1. Image Preprocessing using sharp, directly from the uploaded file path
        const processedImageBuffer = await sharp(uploadedFilePath)
            .resize({ width: 1000, withoutEnlargement: true }) // Resize to a reasonable width
            .grayscale() // Convert to grayscale
            .sharpen() // Sharpen the image
            .toBuffer();

        // 2. OCR with Tesseract.js using the processed image buffer
        const { data: { text } } = await worker.recognize(processedImageBuffer);

        // 3. Send the response
        res.json({ text });

    } catch (error) {
        console.error("OCR or image processing error:", error);
        res.status(500).send("Error processing image.");
    } finally {
        // This block ensures that cleanup happens regardless of success or failure.
        try {
            // Terminate the Tesseract worker to free up resources
            if (worker) {
                await worker.terminate();
            }
            // Cleanup: Delete the temporary uploaded file
            await fs.unlink(uploadedFilePath);
            // Use a stat check to prevent errors if the processed file was never created
            
        } catch (cleanupError) {
            console.error("Error during resource cleanup:", cleanupError);
        }
    }
});

export default router;

