/**
 * Grade Scale Routes - Per-school grading system management
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { roles } from '../config/roles.js';
import {
  getSchoolGradingSystem,
  updateSchoolGradingSystem,
  getAvailableGradingSystems,
  validateCustomGradeScale,
  previewGradeCalculations,
  getSchoolGradeDistribution
} from '../controllers/gradeScaleController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get available grading systems (all authenticated users)
router.get('/systems', getAvailableGradingSystems);

// Validate custom grade scale (Principal+)
router.post('/validate', 
  requireRole([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
  validateCustomGradeScale
);

// Preview grade calculations (Teacher+)
router.post('/preview',
  requireRole([roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
  previewGradeCalculations
);

// School-specific routes
router.route('/schools/:schoolId')
  .get(getSchoolGradingSystem)  // Get school's grading system
  .put(
    requireRole([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
    updateSchoolGradingSystem   // Update school's grading system
  );

// Get grade distribution for a school
router.get('/schools/:schoolId/distribution', getSchoolGradeDistribution);

export default router;