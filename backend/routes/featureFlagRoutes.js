import express from "express";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import { getAllFeatureFlags, toggleFeatureFlag } from "../controllers/featureFlagController.js";

const router = express.Router(); // eslint-disable-line new-cap

// These routes are ONLY for the Global Super Admin
router.use(protect);
router.use(authorizeRoles([roles.GLOBAL_SUPER_ADMIN]));

/**
 * @route   GET /api/features
 * @desc    Get all feature flags and their status.
 * @access  Global Super Admin
 */
router.get("/", getAllFeatureFlags);

/**
 * @route   PATCH /api/features/:name/toggle
 * @desc    Toggle a feature flag on or off.
 * @access  Global Super Admin
 */
router.patch("/:name/toggle", toggleFeatureFlag);

export default router;

