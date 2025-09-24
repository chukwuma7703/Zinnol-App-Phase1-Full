import express from "express";
import { getSharedAnalytics } from "../controllers/publicController.js";

const router = express.Router(); // eslint-disable-line new-cap

/**
 * @route   GET /api/public/analytics/:token
 * @desc    Access a shared analytics report using a secure token.
 * @access  Public
 */
router.get("/analytics/:token", getSharedAnalytics);

export default router;
