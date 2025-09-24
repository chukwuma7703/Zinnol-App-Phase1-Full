import multer from "multer";
import path from "path";
import AppError from "../utils/AppError.js";

// Where to store uploaded files
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, "uploads/events"); // folder must exist or create automatically
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

// Simple filter (accept only images)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files allowed"), false);
  }
};

export const uploadEventImage = multer({ storage, fileFilter });

// --- Voice Note Upload Configuration ---

const voiceNoteStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure this directory exists
    cb(null, "uploads/voice-notes/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const voiceNoteFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("audio/")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an audio file! Please upload only audio.", 400), false);
  }
};

// Export a new multer instance for voice notes with a 1MB file size limit
export const voiceNoteUpload = multer({
  storage: voiceNoteStorage,
  fileFilter: voiceNoteFileFilter,
  limits: { fileSize: 1024 * 1024 * 1 } // 1MB limit
});

