/**
 * Predictive Analytics Routes
 * AI-powered early warning system for academic decline
 */

import express from 'express';
import {
  predictStudentDecline,
  predictClassroomDeclines,
  getSchoolRiskDashboard,
  monitorStudent,
  getPredictionAccuracy,
  getInterventionPlan
} from '../controllers/predictiveAnalyticsController.js';
import { protect, authorizeRoles, roles } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/predict/student/:studentId
 * @desc    Get decline risk prediction for a single student
 * @access  Teachers, Admins, Parents (for their children)
 */
router.get(
  '/student/:studentId',
  predictStudentDecline
);

/**
 * @route   GET /api/predict/classroom/:classroomId
 * @desc    Get predictions for entire classroom
 * @access  Teachers (of the class), Admins
 */
router.get(
  '/classroom/:classroomId',
  predictClassroomDeclines
);

/**
 * @route   GET /api/predict/school-dashboard
 * @desc    Get school-wide risk dashboard
 * @access  Admins, Principals only
 */
router.get(
  '/school-dashboard',
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL
  ]),
  getSchoolRiskDashboard
);

/**
 * @route   POST /api/predict/monitor/:studentId
 * @desc    Monitor student and trigger alerts
 * @access  Admins only (usually automated)
 */
router.post(
  '/monitor/:studentId',
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL
  ]),
  monitorStudent
);

/**
 * @route   GET /api/predict/accuracy
 * @desc    Get model accuracy metrics
 * @access  Global/Main Super Admin only
 */
router.get(
  '/accuracy',
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN
  ]),
  getPredictionAccuracy
);

/**
 * @route   GET /api/predict/interventions/:studentId
 * @desc    Get detailed intervention plan for at-risk student
 * @access  Teachers, Admins
 */
router.get(
  '/interventions/:studentId',
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
    roles.TEACHER
  ]),
  getInterventionPlan
);

export default router;