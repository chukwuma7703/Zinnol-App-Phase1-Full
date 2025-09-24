import express from 'express';
import { createScheme, getScheme, updateLessonStatus, addLessonNote, reviewLesson, addLessonFeedback } from '../controllers/schemeController.js';
import { protect, authorizeRoles, roles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Creation of scheme (teachers and above)
router.post('/scheme', protect, authorizeRoles([roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]), createScheme);
// Get scheme
router.get('/scheme/:id', protect, getScheme);
// Lesson status
router.patch('/lesson/:id/status', protect, authorizeRoles([roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]), updateLessonStatus);
// Lesson note
router.post('/lesson/:id/note', protect, authorizeRoles([roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]), addLessonNote);
// Review lesson
router.post('/lesson/:id/review', protect, authorizeRoles([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]), reviewLesson);
// Parent / principal feedback
router.post('/lesson/:id/feedback', protect, authorizeRoles([roles.PARENT, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]), addLessonFeedback);

export default router;
