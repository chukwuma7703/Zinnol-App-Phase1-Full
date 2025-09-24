import asyncHandler from "express-async-handler";
import express from "express";
import Joi from "joi";
import School from "../models/School.js";
import User from "../models/userModel.js";
import AppError from "../utils/AppError.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { roles } from "../config/roles.js";
import { checkFeatureFlag } from "../middleware/featureFlagMiddleware.js";
import { checkSchoolAccess, checkStudentAccess } from "../middleware/schoolMiddleware.js";
import { validate, commonSchemas } from "../middleware/validationMiddleware.js";
import {
  createSchool,
  getSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  assignMainSuperAdmin,
  assignMainSuperAdminByEmail,
  addStudentToSchool,
  updateStudentInSchool,
  removeMainSuperAdmin,
  removeStudentFromSchool,
  activateSchoolBasic,
  deactivateSchoolBasic,
} from "../controllers/schoolController.js";

import {
  getSchoolGradingSystem,
  updateSchoolGradingSystem,
  getAvailableGradingSystems,
  validateCustomGradeScale,
  previewGradeCalculations,
  getSchoolGradeDistribution
} from "../controllers/gradeScaleController.js";
import { exportSchoolsCsv, bulkApproveSchools, bulkRejectSchools } from "../controllers/schoolController.js";

const router = express.Router();
// Endpoint: GET /api/schools/locations
router.get("/locations", validate(Joi.object({
  active: Joi.boolean().optional()
}), 'query'), async (req, res) => {
  try {
    const schools = await School.find({ isActive: true });
    const schoolsWithLocation = schools.map(school => ({
      ...school.toObject(),
      location: {
        coordinates: [school.lng, school.lat]
      }
    }));
    res.json({ schools: schoolsWithLocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Apply authentication to all subsequent school management routes (after public endpoints) */
// Note: Public endpoints like /locations are defined above this line
router.use(protect);

// ...existing code...

/* ---------------------------------------------------
   1. Create School (Global Super Admin only)
   --------------------------------------------------- */
router
  .route("/")
  .post(authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), validate(Joi.object({
    name: commonSchemas.name.required(),
    address: Joi.string().trim().min(5).max(500).required(),
    phone: commonSchemas.phone.required(),
    email: commonSchemas.email.required(),
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180),
    // Website is optional; allow empty string to avoid validation errors when omitted by UI
    website: Joi.string().uri().allow('').optional(),
    description: Joi.string().trim().max(1000),
    // Optional: create/assign a Main Super Admin at creation time
    mainSuperAdminName: Joi.string().trim().min(2).max(100).optional(),
    mainSuperAdminEmail: commonSchemas.email.optional(),
    mainSuperAdminPhone: commonSchemas.phone.optional()
  })), createSchool)
  .get(
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
    validate(Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
      search: Joi.string().trim().max(100).optional(),
      sortBy: Joi.string().valid('name', 'createdAt', 'totalStudents').optional(),
      sortOrder: Joi.string().valid('asc', 'desc').optional()
    }), 'query'),
    getSchools
  );

/* ---------------------------------------------------
   Export Schools (Global Super Admin only)
   --------------------------------------------------- */
router.get(
  "/export",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
  exportSchoolsCsv
);

/* ---------------------------------------------------
   Bulk Approve/Reject (Global Super Admin only)
   --------------------------------------------------- */
router.post(
  "/bulk-approve",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
  validate(Joi.object({ schoolIds: Joi.array().items(commonSchemas.objectId).min(1).required() })),
  bulkApproveSchools
);

router.post(
  "/bulk-reject",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
  validate(Joi.object({ schoolIds: Joi.array().items(commonSchemas.objectId).min(1).required() })),
  bulkRejectSchools
);

/* ---------------------------------------------------
   2. Assign / Remove Main Super Admin (Global only)
   --------------------------------------------------- */
router.post(
  "/:id/assign-main-super-admin",
  checkFeatureFlag("assign-main-super-admin"),
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  assignMainSuperAdmin
);

// Assign by email (create if not exists)
router.post(
  "/:id/assign-main-super-admin-by-email",
  checkFeatureFlag("assign-main-super-admin"),
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: commonSchemas.email.required(),
    phone: commonSchemas.phone.optional()
  })),
  assignMainSuperAdminByEmail
);

router.delete(
  "/:id/remove-main-super-admin",
  checkFeatureFlag("assign-main-super-admin"), // Same feature flag controls add/remove
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  removeMainSuperAdmin
);

/* ---------------------------------------------------
   Generic Role Assignment Handler Factory
   --------------------------------------------------- */

/**
 * Creates a generic request handler for assigning a role to a user within a school.
 * @param {string} targetRole - The role to be assigned (e.g., roles.TEACHER).
 * @param {string[]} protectedRoles - An array of roles that cannot be demoted by this assignment.
 * @param {string} roleName - The user-friendly name of the role (e.g., "Teacher").
 * @returns {Function} An express-async-handler middleware function.
 */
const createRoleAssignmentHandler = (targetRole, protectedRoles, roleName) =>
  asyncHandler(async (req, res, next) => {
    const { userId } = req.body;
    const school = req.school; // from checkSchoolAccess middleware

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    // Prevent demoting a user with a protected role
    if (protectedRoles.includes(user.role)) {
      return next(
        new AppError(`Cannot change the role of a user with a higher-level role (${user.role}).`, 400)
      );
    }

    user.role = targetRole;
    user.school = school._id;
    await user.save();

    res.json({ message: `${roleName} assigned successfully`, school });
  });


/* ---------------------------------------------------
   3. Assign Super Admin (Global or Main Super Admin)
   --------------------------------------------------- */
router.post(
  "/:id/assign-super-admin",
  checkFeatureFlag("assign-super-admin"),

  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  createRoleAssignmentHandler(roles.SUPER_ADMIN, [roles.GLOBAL_SUPER_ADMIN], "Super Admin")

);

/* ---------------------------------------------------
   4. Assign Principal Admin (Super / Main / Global)
   --------------------------------------------------- */
router.post(
  "/:id/assign-principal",
  checkFeatureFlag("assign-principal"),
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  createRoleAssignmentHandler(
    roles.PRINCIPAL,
    [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN],
    "Principal"
  )



);

/* ---------------------------------------------------
   5. Assign Teacher (Principal / Super / Main / Global)
   --------------------------------------------------- */
router.post(
  "/:id/assign-teacher",
  checkFeatureFlag("assign-teacher"),
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
  ]),

  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  createRoleAssignmentHandler(
    roles.TEACHER,
    [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL],
    "Teacher"
  )
);




/* ---------------------------------------------------
   6. Assign Parent (Teacher / Principal / Super / Main / Global)
   --------------------------------------------------- */
router.post(
  "/:id/assign-parent",
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
    roles.TEACHER,
  ]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  createRoleAssignmentHandler(
    roles.PARENT,
    [
      roles.GLOBAL_SUPER_ADMIN,
      roles.MAIN_SUPER_ADMIN,
      roles.SUPER_ADMIN,
      roles.PRINCIPAL,
      roles.TEACHER,
    ],
    "Parent"
  )
);

/* ---------------------------------------------------
   7. Assign Student (Teacher / Principal / Super / Main / Global)
   --------------------------------------------------- */
router.post(
  "/:id/assign-student",
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
    roles.TEACHER,
  ]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({ userId: commonSchemas.objectId.required() })),
  createRoleAssignmentHandler(
    roles.STUDENT,
    [
      roles.GLOBAL_SUPER_ADMIN,
      roles.MAIN_SUPER_ADMIN,
      roles.SUPER_ADMIN,
      roles.PRINCIPAL,
      roles.TEACHER,
      roles.PARENT,
    ],
    "Student"
  )
);

/* ---------------------------------------------------
   School Management (Update, Delete)
   --------------------------------------------------- */

router
  .route("/:id")
  .get(
    checkSchoolAccess,
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    getSchoolById
  )
  .put(
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
    checkSchoolAccess,
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    validate(Joi.object({
      name: commonSchemas.name.optional(),
      address: commonSchemas.address.optional(),
      phone: commonSchemas.phone.optional(),
      email: commonSchemas.email.optional(),
      // Website optional on update too; allow empty string to clear it
      website: Joi.string().uri().allow('').optional(),
      description: Joi.string().trim().max(1000).optional(),
      establishedYear: Joi.number().integer().min(1800).max(new Date().getFullYear()).optional(),
      principalName: commonSchemas.name.optional(),
      totalStudents: Joi.number().integer().min(0).optional(),
      totalTeachers: Joi.number().integer().min(0).optional(),
      accreditation: Joi.string().trim().max(100).optional(),
      facilities: Joi.array().items(Joi.string().trim().max(100)).optional(),
      curriculum: Joi.string().trim().max(200).optional()
    })),
    updateSchool
  )
  .delete(
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN]),
    checkSchoolAccess,
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    deleteSchool
  );

// Lightweight activate/deactivate endpoints for Global or Main Super Admin with access
router.put(
  "/:id/activate",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  activateSchoolBasic
);

router.put(
  "/:id/deactivate",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  deactivateSchoolBasic
);

/* ---------------------------------------------------
   8. Student Management (Create, Update, Delete)
   --------------------------------------------------- */

const studentManagementRoles = [roles.MAIN_SUPER_ADMIN, roles.PRINCIPAL];

// POST /api/schools/:id/students
router.post(
  "/:id/students",
  authorizeRoles(studentManagementRoles), // This ensures teachers get a 403 Forbidden
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    name: commonSchemas.name.required(),
    email: commonSchemas.email.required(),
    password: Joi.string().min(6).required(),
    phone: commonSchemas.phone.optional(),
    class: commonSchemas.class.optional(),
    className: Joi.string().trim().max(100).optional(),
    section: commonSchemas.section.optional(),
    rollNumber: Joi.string().trim().max(20).optional(),
    dateOfBirth: Joi.date().iso().optional(),
    gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
    address: Joi.string().trim().max(500).optional(),
    parentId: commonSchemas.objectId.optional(),
    admissionNumber: Joi.string().trim().max(50).optional()
  })),
  addStudentToSchool
);

// PUT /api/schools/:id/students/:studentId
router.put(
  "/:id/students/:studentId",
  authorizeRoles(studentManagementRoles),
  checkSchoolAccess,
  checkStudentAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required(), studentId: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    name: commonSchemas.name.optional(),
    email: commonSchemas.email.optional(),
    password: Joi.string().min(6).optional(),
    phone: commonSchemas.phone.optional(),
    class: commonSchemas.class.optional(),
    className: Joi.string().trim().max(100).optional(),
    section: commonSchemas.section.optional(),
    rollNumber: Joi.string().trim().max(20).optional(),
    dateOfBirth: Joi.date().iso().optional(),
    gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
    address: Joi.string().trim().max(500).optional(),
    parentId: commonSchemas.objectId.optional(),
    admissionNumber: Joi.string().trim().max(50).optional()
  })),
  updateStudentInSchool
);

// DELETE /api/schools/:id/students/:studentId
router.delete(
  "/:id/students/:studentId",
  authorizeRoles(studentManagementRoles),
  checkSchoolAccess,
  checkStudentAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required(), studentId: commonSchemas.objectId.required() }), 'params'),
  removeStudentFromSchool
);

/* ---------------------------------------------------
   9. Grading System Management
   --------------------------------------------------- */

// GET /api/schools/:id/grading-system
router.get(
  "/:id/grading-system",
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  getSchoolGradingSystem
);

// PUT /api/schools/:id/grading-system
router.put(
  "/:id/grading-system",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]),
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    type: Joi.string().valid('WAEC', 'CAMBRIDGE', 'IB', 'US_GPA', 'CUSTOM').required(),
    customScale: Joi.when('type', {
      is: 'CUSTOM',
      then: Joi.array().items(Joi.object({
        code: Joi.string().trim().max(10).required(),
        label: Joi.string().trim().max(50).required(),
        minScore: Joi.number().min(0).max(100).required(),
        maxScore: Joi.number().min(0).max(100).required(),
        remarks: Joi.string().trim().max(100).optional()
      })).min(1).required(),
      otherwise: Joi.forbidden()
    }),
    passingGrade: Joi.string().trim().max(10).optional(),
    honorRollGrade: Joi.string().trim().max(10).optional()
  })),
  updateSchoolGradingSystem
);

// GET /api/schools/:id/grade-distribution
router.get(
  "/:id/grade-distribution",
  checkSchoolAccess,
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    session: Joi.string().trim().max(20).optional(),
    term: Joi.number().integer().min(1).max(3).optional()
  }), 'query'),
  getSchoolGradeDistribution
);

/* ---------------------------------------------------
   10. Global Grading System Routes (no school ID needed)
   --------------------------------------------------- */

// GET /api/grading-systems (available systems)
router.get(
  "/grading-systems",
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
    roles.TEACHER
  ]),
  getAvailableGradingSystems
);

// POST /api/grading-systems/validate
router.post(
  "/grading-systems/validate",
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]),
  validate(Joi.object({
    gradeScale: Joi.array().items(Joi.object({
      code: Joi.string().trim().max(10).required(),
      label: Joi.string().trim().max(50).required(),
      minScore: Joi.number().min(0).max(100).required(),
      maxScore: Joi.number().min(0).max(100).required(),
      remarks: Joi.string().trim().max(100).optional()
    })).min(1).required()
  })),
  validateCustomGradeScale
);

// POST /api/grading-systems/preview
router.post(
  "/grading-systems/preview",
  authorizeRoles([
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
    roles.TEACHER
  ]),
  validate(Joi.object({
    gradeScale: Joi.array().items(Joi.object({
      code: Joi.string().trim().max(10).required(),
      label: Joi.string().trim().max(50).required(),
      minScore: Joi.number().min(0).max(100).required(),
      maxScore: Joi.number().min(0).max(100).required(),
      remarks: Joi.string().trim().max(100).optional()
    })).min(1).required(),
    testScores: Joi.array().items(Joi.number().min(0).max(100)).optional()
  })),
  previewGradeCalculations
);

export default router;



