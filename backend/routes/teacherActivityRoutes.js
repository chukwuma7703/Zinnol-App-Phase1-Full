/**
 * Teacher Activity Routes with AI Coaching
 */

import express from 'express';
import TeacherActivity from '../models/teacherActivityModel.js';
import {
  startTeachingSession,
  endTeachingSession,
  getCoachingFeedback,
  getCoachingHistory,
  getActivityStats,
  getSchoolCoachingAnalytics,
  requestImmediateCoaching
} from '../controllers/teacherActivityController.js';
import { protect, authorizeRoles, roles } from '../middleware/authMiddleware.js';
import { handleValidationErrors } from '../middleware/validation.js';
import { body, param, query } from 'express-validator';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/activity/start
 * @desc    Start a new teaching session
 * @access  Teachers only
 */
router.post(
  '/start',
  authorizeRoles([roles.TEACHER]),
  [
    body('classroomId').isMongoId().withMessage('Valid classroom ID required'),
    body('subjectId').isMongoId().withMessage('Valid subject ID required'),
    body('topic').trim().notEmpty().withMessage('Topic is required'),
    body('plannedDuration').optional().isInt({ min: 5, max: 480 }).withMessage('Duration must be between 5 and 480 minutes'),
    body('objectives').optional().isArray().withMessage('Objectives must be an array'),
    handleValidationErrors
  ],
  startTeachingSession
);

/**
 * @route   PATCH /api/activity/:id/end
 * @desc    End a teaching session with feedback
 * @access  Teachers only (own sessions)
 */
router.patch(
  '/:id/end',
  authorizeRoles([roles.TEACHER]),
  [
    param('id').isMongoId().withMessage('Valid session ID required'),
    body('feedbackNote')
      .trim()
      .isLength({ min: 100 })
      .withMessage('Feedback note must be at least 100 characters')
      .custom((value) => {
        const wordCount = value.trim().split(/\s+/).length;
        if (wordCount < 100) {
          throw new Error(`Feedback must be at least 100 words (current: ${wordCount} words)`);
        }
        return true;
      }),
    body('studentsPresent').optional().isInt({ min: 0 }).withMessage('Students present must be a positive number'),
    body('objectivesAchieved').optional().isArray().withMessage('Objectives achieved must be an array'),
    body('challengesFaced').optional().isArray().withMessage('Challenges must be an array'),
    handleValidationErrors
  ],
  endTeachingSession
);

/**
 * @route   GET /api/activity/:id/coaching
 * @desc    Get AI coaching feedback for a session
 * @access  Teachers (own), Admins
 */
router.get(
  '/:id/coaching',
  [
    param('id').isMongoId().withMessage('Valid session ID required'),
    handleValidationErrors
  ],
  getCoachingFeedback
);

/**
 * @route   GET /api/activity/coaching-history
 * @desc    Get coaching history for a teacher
 * @access  Teachers (own), Admins (any teacher)
 */
router.get(
  '/coaching-history',
  [
    query('teacherId').optional().isMongoId().withMessage('Valid teacher ID required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    handleValidationErrors
  ],
  getCoachingHistory
);

/**
 * @route   GET /api/activity/stats
 * @desc    Get teaching activity statistics
 * @access  Teachers (own), Admins (school-wide)
 */
router.get(
  '/stats',
  [
    query('teacherId').optional().isMongoId().withMessage('Valid teacher ID required'),
    query('startDate').optional().isISO8601().withMessage('Valid start date required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date required'),
    handleValidationErrors
  ],
  getActivityStats
);

/**
 * @route   GET /api/activity/school-coaching-analytics
 * @desc    Get school-wide coaching analytics
 * @access  Admins only
 */
router.get(
  '/school-coaching-analytics',
  authorizeRoles([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
  [
    query('startDate').optional().isISO8601().withMessage('Valid start date required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date required'),
    handleValidationErrors
  ],
  getSchoolCoachingAnalytics
);

/**
 * @route   POST /api/activity/:id/request-coaching
 * @desc    Request immediate AI coaching (premium feature)
 * @access  Teachers only (own sessions)
 */
router.post(
  '/:id/request-coaching',
  authorizeRoles([roles.TEACHER]),
  [
    param('id').isMongoId().withMessage('Valid session ID required'),
    handleValidationErrors
  ],
  requestImmediateCoaching
);

/**
 * @route   POST /api/activity/:id/rate-coaching
 * @desc    Rate AI coaching feedback
 * @access  Teachers only (own sessions)
 */
router.post(
  '/:id/rate-coaching',
  authorizeRoles([roles.TEACHER]),
  [
    param('id').isMongoId().withMessage('Valid session ID required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('helpful').isBoolean().withMessage('Helpful must be true or false'),
    body('feedback').optional().trim().isLength({ max: 500 }).withMessage('Feedback must not exceed 500 characters'),
    handleValidationErrors
  ],
  async (req, res, next) => {
    try {
      const session = await TeacherActivity.findById(req.params.id);

      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      if (session.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only rate your own coaching feedback'
        });
      }

      await session.rateCoaching(req.body.rating, req.body.feedback, req.body.helpful);

      res.status(200).json({
        success: true,
        message: 'Coaching feedback rated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/activity/best-practices
 * @desc    Get best teaching practices from high-scoring sessions
 * @access  All authenticated users in school
 */
router.get(
  '/best-practices',
  [
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
    handleValidationErrors
  ],
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const bestPractices = await TeacherActivity.getBestPractices(req.user.school, limit);

      res.status(200).json({
        success: true,
        message: 'Best practices retrieved',
        data: bestPractices
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/activity/needs-support
 * @desc    Get sessions that need support (low coaching scores)
 * @access  Admins only
 */
router.get(
  '/needs-support',
  authorizeRoles([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
  [
    query('threshold').optional().isInt({ min: 0, max: 100 }).withMessage('Threshold must be between 0 and 100'),
    handleValidationErrors
  ],
  async (req, res, next) => {
    try {
      const threshold = parseInt(req.query.threshold) || 50;
      const strugglingSessions = await TeacherActivity.getStrugglingSessions(req.user.school, threshold);

      res.status(200).json({
        success: true,
        message: 'Sessions needing support retrieved',
        data: strugglingSessions
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;