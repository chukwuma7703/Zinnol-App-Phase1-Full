import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { roles } from "../config/roles.js";
import { voiceResultEntry } from "../controllers/voiceResultController.js";

const router = express.Router();

// Only teachers can use voice result entry
// Temporarily disabled for testing
router.post("/voice-entry", voiceResultEntry);

export default router;
