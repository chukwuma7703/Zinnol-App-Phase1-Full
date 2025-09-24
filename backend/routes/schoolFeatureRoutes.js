import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { roles } from "../config/roles.js";
import { setAllFeaturesForSchool, getFeaturesForSchool, setFeatureForSchool } from "../controllers/schoolFeatureController.js";

const router = express.Router();

// Only Global Super Admin can manage features for any school
router.use(protect);
router.use(authorizeRoles([roles.GLOBAL_SUPER_ADMIN]));

// Bulk enable/disable all features for a school
router.patch("/:schoolId/features/all", setAllFeaturesForSchool);

// Get all features for a school
router.get("/:schoolId/features", getFeaturesForSchool);

// Set individual feature for a school
router.patch("/:schoolId/features/:feature", setFeatureForSchool);

export default router;
