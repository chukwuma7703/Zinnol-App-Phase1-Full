import express from "express";
import { getStudentExamHistory } from "../controllers/analysisController.js";
import { body, validationResult } from "express-validator";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import { validate, examSchemas } from "../middleware/validationMiddleware.js";
import {
  addQuestionToExam,
  createExam,
  beginExam,
  markStudentExam,
  getExams,
  startExam,
  getExamSubmissions,
  submitAnswer,
  finalizeSubmission,
  postExamScoreToResult,
  adjustExamTime,
  bulkPublishExamScores,
  pauseExam,
  resumeExam,
  sendExamAnnouncement,
  assignInvigilator,
  removeInvigilator,
  getInvigilators,
  overrideAnswerScore,
  endExam,

} from "../controllers/examController.js";
import { checkExamAccess } from "../middleware/examMiddleware.js";
const router = express.Router();
router.use(protect);

const authorizedRolesForExams = [
  roles.TEACHER,
  roles.PRINCIPAL,
  roles.SUPER_ADMIN,
  roles.MAIN_SUPER_ADMIN,
  roles.GLOBAL_SUPER_ADMIN,
];

// --- Admin & Teacher Routes ---


/**
 * @route   GET /api/exams
 * @desc    Get a list of exams with filters.
 * @access  Protected (Teachers, Principals, Admins)
 * @route   POST /api/exams
 * @desc    Create a new exam.
 * @access  Protected (Teachers, Principals, Admins)
 * 
 */
router.route("/")
  .get(
    authorizeRoles(authorizedRolesForExams),
    validate(examSchemas.getExams, 'query'),
    getExams
  )
  .post(
    authorizeRoles(authorizedRolesForExams),
    validate(examSchemas.createExam),
    createExam
  );

/**
 * @route   POST /api/exams/:examId/questions
 * @desc    Add a question to an existing exam.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.post(
  "/:examId/questions",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.addQuestion),
  addQuestionToExam
);

/**
 * @route   GET /api/exams/:examId/submissions
 * @desc    Get all student submissions for a specific exam.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.get(
  "/:examId/submissions",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  getExamSubmissions
);

/**
 * @route   POST /api/exams/submissions/:submissionId/mark
 * @desc    Marks a completed student exam submission automatically.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.post(
  "/submissions/:submissionId/mark",
  authorizeRoles(authorizedRolesForExams),
  validate(examSchemas.submissionId, 'params'),
  markStudentExam
);



/**
 * @route   PATCH /api/exams/submissions/:submissionId/answers/:answerId/override
 * @desc    Teacher manually overrides the score for a single answer.
 * @access  Protected (Teachers, Admins)
 */
router.patch(
  "/submissions/:submissionId/answers/:answerId/override",
  authorizeRoles(authorizedRolesForExams),
  validate(examSchemas.submissionWithAnswerId, 'params'),
  validate(examSchemas.overrideAnswerScore),
  overrideAnswerScore
);



/**
 * @route   POST /api/exams/submissions/:submissionId/post-to-report-card
 * @desc    Posts a marked exam score to the student's main report card.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.post(
  "/submissions/:submissionId/post-to-report-card",
  authorizeRoles(authorizedRolesForExams),
  validate(examSchemas.submissionId, 'params'),
  postExamScoreToResult
);

/**
* @route   POST /api/exams/:examId/bulk-publish
* @desc    Posts all available scores for an exam to student report cards.
* @access  Protected (Teachers, Principals, Admins)
*/
router.post(
  "/:examId/bulk-publish",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  bulkPublishExamScores
);

/**
 * @route   PATCH /api/exams/:examId/adjust-time
 * @desc    Adjust the duration for an ongoing exam.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.patch(
  "/:examId/adjust-time",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  validate(examSchemas.adjustExamTime),
  adjustExamTime
);

/**
 * @route   POST /api/exams/:examId/announce
 * @desc    Send a real-time announcement to all students in an exam.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.post(
  "/:examId/announce",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  validate(examSchemas.sendAnnouncement),
  sendExamAnnouncement
);

/**
 * @route   POST /api/exams/:examId/end
 * @desc    End an exam for all students immediately.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.post(
  "/:examId/end",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  endExam
);

/**
 * @route   GET /api/exams/:examId/invigilators
 * @desc    Get all assigned invigilators for an exam.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.get(
  "/:examId/invigilators",
  authorizeRoles(authorizedRolesForExams),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  getInvigilators
);

/**
 * @route   POST /api/exams/:examId/invigilators
 * @desc    Assign an invigilator to an exam.
 * @access  Protected (Principals, Admins)
 */
router.post(
  "/:examId/invigilators",
  authorizeRoles([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
  checkExamAccess,
  validate(examSchemas.examId, 'params'),
  validate(examSchemas.assignInvigilator),
  assignInvigilator
);

/**
 * @route   DELETE /api/exams/:examId/invigilators/:teacherId
 * @desc    Remove an invigilator from an exam.
 * @access  Protected (Principals, Admins)
 */
router.delete(
  "/:examId/invigilators/:teacherId",
  authorizeRoles([roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN]),
  checkExamAccess,
  validate(examSchemas.invigilatorId, 'params'),
  removeInvigilator
);


// --- Student-facing Routes ---

/**
 * @route   POST /api/exams/:examId/start
 * @desc    Student requests to start an exam session, gets questions.
 * @access  Protected (Students)
 */
router.post(
  "/:examId/start",
  authorizeRoles([roles.STUDENT]),
  validate(examSchemas.examId, 'params'),
  startExam
);

/**
 * @route   POST /api/exams/submissions/:submissionId/begin
 * @desc    Student confirms readiness and starts the exam timer.
 * @access  Protected (Students)
 */
router.post(
  "/submissions/:submissionId/begin",
  authorizeRoles([roles.STUDENT]),
  validate(examSchemas.submissionId, 'params'),
  beginExam
);

/**
 * @route   PATCH /api/exams/submissions/:submissionId/answer
 * @desc    Student saves an answer for a question.
 * @access  Protected (Students)
 */
router.patch(
  "/submissions/:submissionId/answer",
  authorizeRoles([roles.STUDENT]),
  validate(examSchemas.submissionId, 'params'),
  validate(examSchemas.submitAnswer),
  submitAnswer
);

/**
 * @route   POST /api/exams/submissions/:submissionId/finalize
 * @desc    Student finalizes their exam submission.
 * @access  Protected (Students)
 */
router.post(
  "/submissions/:submissionId/finalize",
  authorizeRoles([roles.STUDENT]),
  validate(examSchemas.submissionId, 'params'),
  finalizeSubmission
);

/**
   
 * @route   POST /api/exams/submissions/:submissionId/pause
 * @desc    Teacher/Admin pauses a student's exam.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.post(
  "/submissions/:submissionId/pause",
  authorizeRoles(authorizedRolesForExams),
  validate(examSchemas.submissionId, 'params'),
  pauseExam
);

/**
 * @route   POST /api/exams/submissions/:submissionId/resume
 * @desc    Student resumes their exam.
 * @access  Protected (Students)
 */
router.post(
  "/submissions/:submissionId/resume",
  authorizeRoles([roles.STUDENT]),
  validate(examSchemas.submissionId, 'params'),
  resumeExam
);

// --- Analytics-related Routes ---

/**
 * @route   GET /api/exams/history/student/:studentId
 * @desc    Get a student's full exam history across all sessions.
 * @access  Protected (Admins, Teachers, and Parent/Student for their own profile)
 */
router.get(
  "/history/student/:studentId",
  protect,
  validate(examSchemas.studentExamHistory, 'params'),
  validate(examSchemas.studentExamHistoryQuery, 'query'),
  getStudentExamHistory
);


export default router;
