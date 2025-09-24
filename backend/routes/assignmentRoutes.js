import express from 'express';
import { protect, authorizeRoles, roles } from '../middleware/authMiddleware.js';
import {
    createAssignment,
    getAssignmentsForClass,
    getAssignment,
    updateAssignment,
    submitAssignment,
    gradeSubmission,
} from '../controllers/assignmentController.js';

const router = express.Router();

// All routes in this file are protected
router.use(protect);

// Teacher creates an assignment
router.post(
    '/',
    authorizeRoles([roles.TEACHER]),
    createAssignment
);

// Teacher or Student gets assignments for a specific class
router.get(
    '/class/:classroomId',
    authorizeRoles([roles.TEACHER, roles.STUDENT]),
    getAssignmentsForClass
);

// Teacher or Student gets a single assignment
router.get(
    '/:id',
    authorizeRoles([roles.TEACHER, roles.STUDENT]),
    getAssignment
);

// Teacher updates an assignment
router.patch(
    '/:id',
    authorizeRoles([roles.TEACHER]),
    updateAssignment
);

// Student submits an assignment
router.post(
    '/:id/submit',
    authorizeRoles([roles.STUDENT]),
    submitAssignment
);

// Teacher grades a submission
router.patch(
    '/submissions/:submissionId/grade',
    authorizeRoles([roles.TEACHER]),
    gradeSubmission
);

export default router;