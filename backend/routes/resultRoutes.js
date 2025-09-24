
import express from "express";
import multer from "multer";
import Joi from "joi";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import { checkFeatureFlag } from "../middleware/featureFlagMiddleware.js";
import { validate, commonSchemas, resultSchemas } from "../middleware/validationMiddleware.js";
import {
  submitResult,
  approveResult,
  rejectResult,
  getStudentResults,
  generateAnnualResultsForClassroom,
  getAllResults,
  uploadVoiceNote,
  deleteVoiceNote,
  submitResultsFromOCR,
  bulkImportResults,
  bulkExportResults
} from "../controllers/resultController.js";
import { voiceNoteUpload } from "../middleware/uploadMiddleware.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
router.use(protect);




// --- Routes for submitting and managing results ---

/**
 * @route POST /api/results/
 * @desc Teachers submit/update a result (status = pending)
 * @access Protected (Teachers, Principals, Super Admins)
 */
router.post(
  "/",
  authorizeRoles([
    roles.TEACHER,
    roles.PRINCIPAL,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.GLOBAL_SUPER_ADMIN,
  ]),
  validate(resultSchemas.createResult),
  submitResult
);

/**
 * @route POST /api/results/bulk-from-ocr
 * @desc Upload a single image of a class result sheet to bulk-create results.
 * @access Protected (Teachers, Principals, Super Admins)
 */
router.post(
  "/bulk-from-ocr",
  checkFeatureFlag("ocr-bulk-upload"),
  authorizeRoles([
    roles.TEACHER,
    roles.PRINCIPAL,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.GLOBAL_SUPER_ADMIN,
  ]),
  upload.single("resultSheetImage"),
  // Accept subjectOrderJSON (stringified JSON array of subject IDs in order). For backward
  // compatibility, allow a single subjectId which we'll transform into subjectOrderJSON downstream.
  validate(Joi.object({
    classroomId: commonSchemas.objectId.required(),
    session: commonSchemas.session.required(),
    term: commonSchemas.term.required(),
    subjectOrderJSON: Joi.string().optional(), // validated as JSON in controller
    subjectId: commonSchemas.objectId.optional() // legacy single-subject mode
  }).custom((value, helpers) => {
    if (!value.subjectOrderJSON && !value.subjectId) {
      return helpers.error('any.custom', { message: 'Either subjectOrderJSON or subjectId is required.' });
    }
    return value;
  }, 'subject order presence'), 'body'),
  // Middleware shim: if only subjectId provided, build subjectOrderJSON for controller expectations.
  (req, _res, next) => {
    if (!req.body.subjectOrderJSON && req.body.subjectId) {
      req.body.subjectOrderJSON = JSON.stringify([req.body.subjectId]);
    }
    next();
  },
  submitResultsFromOCR
);

router.patch(
  "/:id/approve",
  checkFeatureFlag("approve-reject-results"),
  authorizeRoles([roles.PRINCIPAL]),
  validate(resultSchemas.resultId, 'params'),
  approveResult
);


/**
 * @route PATCH /api/results/:id/reject
 * @desc Reject a result
 * @access Protected (Principal only)
 */
router.patch(
  "/:id/reject",
  authorizeRoles([roles.PRINCIPAL]),
  validate(resultSchemas.resultId, 'params'),
  validate(resultSchemas.rejectResult),
  rejectResult
);


// --- Routes for generating and retrieving data ---

/**
 * @route POST /api/results/generate-annual/:classroomId/:session
 * @desc Generates annual results for all students in a classroom for a given session.
 * @access Protected (Principals, Super Admins)
 */
router.post(
  "/generate-annual/:classroomId/:session",
  checkFeatureFlag("generate-annual-results"),
  authorizeRoles([
    roles.PRINCIPAL,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.GLOBAL_SUPER_ADMIN,
  ]),
  validate(resultSchemas.generateAnnual, 'params'),
  generateAnnualResultsForClassroom
);

/**
 * @route GET /api/results/generate-printable-sheet
 * @desc Generates data for a printable result sheet based on query parameters
 * @access Protected (Teachers, Principals, Super Admins)
 */

// router.get(
//   "/generate-printable-sheet",
//   authorizeRoles([
//     roles.TEACHER,
//     roles.PRINCIPAL,
//     roles.SUPER_ADMIN,
//     roles.MAIN_SUPER_ADMIN,
//     roles.GLOBAL_SUPER_ADMIN,
//   ]),
//   generatePrintableResultSheetData
// );


/**
 * @route GET /api/results/student/:studentId
 * @desc Get results for a student (restricted to approved for parent/student roles)
 * @access Protected
 */
router.get(
  "/student/:studentId",
  authorizeRoles([
    roles.TEACHER,
    roles.PRINCIPAL,
    roles.PARENT,
    roles.STUDENT,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.GLOBAL_SUPER_ADMIN,
  ]),
  validate(resultSchemas.studentResults, 'params'),
  validate(resultSchemas.studentResultsQuery, 'query'),
  getStudentResults
);

/**
 * @route   POST /api/results/:resultId/voice-note
 * @desc    Upload a voice note for a result sheet (one-time action)
 * @access  Protected (Teacher, Principal)
 */
router.post(
  "/:resultId/voice-note",
  authorizeRoles([
    roles.TEACHER,
    roles.PRINCIPAL,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
  ]),
  voiceNoteUpload.single("voiceNote"), // "voiceNote" is the field name in the form-data
  validate(resultSchemas.resultIdParams, 'params'),
  uploadVoiceNote
);

/**
 * @route   DELETE /api/results/:resultId/voice-note
 * @desc    Delete a voice note for a result sheet, only if result is 'pending'.
 * @access  Protected (Teacher, Principal)
 */
router.delete(
  "/:resultId/voice-note",
  authorizeRoles([
    roles.TEACHER,
    roles.PRINCIPAL,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
  ]),
  validate(resultSchemas.resultIdParams, 'params'),
  deleteVoiceNote
);


/**
 * @route GET /api/results/
 * @desc Get all results (admin/principal only)
 * @access Protected
 */
router.get(
  "/",
  authorizeRoles([
    roles.PRINCIPAL,
    roles.SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.GLOBAL_SUPER_ADMIN,
  ]),
  validate(resultSchemas.getAllResults, 'query'),
  getAllResults
);

export default router;
