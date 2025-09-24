import { roles } from "../config/roles.js";
import { authorizeRoles } from "../middleware/authMiddleware.js";
import { validate, commonSchemas } from "../middleware/validationMiddleware.js";
import fs from "fs";
import path from "path";
// routes/studentRoutes.js
import express from "express";
import multer from "multer";
import Joi from "joi";
import { bulkImportStudents, bulkExportStudents, enrollStudentsFromOCR, createStudent, getStudents, getStudentById, updateStudent, deleteStudent } from "../controllers/studentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router(); // eslint-disable-line new-cap

// Ensure uploads dir exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ...existing code...

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) =>
    cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});

// Bulk import students from CSV
router.post(
  "/bulk-import",
  upload.single("csvFile"),
  protect,
  validate(Joi.object({
    schoolId: commonSchemas.objectId.required(),
    class: commonSchemas.class.optional(),
    section: commonSchemas.section.optional()
  }), 'body'),
  bulkImportStudents
);

// Bulk export students to CSV
router.get(
  "/bulk-export-csv",
  protect,
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]),
  validate(Joi.object({
    schoolId: commonSchemas.objectId.optional(),
    class: commonSchemas.class.optional(),
    section: commonSchemas.section.optional(),
    format: Joi.string().valid('csv', 'excel').optional()
  }), 'query'),
  bulkExportStudents
);
/**
 * @route   POST /api/students/bulk-from-class-list-ocr
 * @desc    Bulk enroll students by scanning a class list document.
 * @access  Protected (Admins, Principals, Teachers)
 */
router.post(
  "/bulk-from-class-list-ocr",
  protect,
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL, roles.TEACHER]),
  multer({ storage: multer.memoryStorage() }).single("classListImage"), // Use memory storage for OCR
  validate(Joi.object({
    schoolId: commonSchemas.objectId.required(),
    class: commonSchemas.class.optional(),
    section: commonSchemas.section.optional()
  }), 'body'),
  enrollStudentsFromOCR
);

router.route("/")
  /**
   * @route   POST /api/students
   * @desc    Create a single student manually.
   * @access  Protected (Admins, Principals)
   */
  .post(
    protect,
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]),
    upload.single("passport"),
    validate(Joi.object({
      name: commonSchemas.name.required(),
      email: commonSchemas.email.required(),
      phone: commonSchemas.phone.optional(),
      schoolId: commonSchemas.objectId.required(),
      class: commonSchemas.class.optional(),
      section: commonSchemas.section.optional(),
      rollNumber: Joi.string().trim().max(20).optional(),
      dateOfBirth: Joi.date().iso().optional(),
      gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
      address: Joi.string().trim().max(500).optional(),
      parentId: commonSchemas.objectId.optional(),
      admissionNumber: Joi.string().trim().max(50).optional(),
      emergencyContact: Joi.object({
        name: commonSchemas.name.optional(),
        phone: commonSchemas.phone.optional(),
        relationship: Joi.string().trim().max(50).optional()
      }).optional(),
      medicalInfo: Joi.object({
        bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional(),
        allergies: Joi.array().items(Joi.string().trim().max(100)).optional(),
        medications: Joi.array().items(Joi.string().trim().max(100)).optional()
      }).optional()
    })),
    createStudent
  )
  /**
   * @route   GET /api/students
   * @desc    List and search for students.
   * @access  Protected (Admins, Principals, Teachers)
   */
  .get(
    protect,
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL, roles.TEACHER]),
    validate(Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
      search: Joi.string().trim().max(100).optional(),
      schoolId: commonSchemas.objectId.optional(),
      class: commonSchemas.class.optional(),
      section: commonSchemas.section.optional(),
      sortBy: Joi.string().valid('name', 'rollNumber', 'createdAt', 'class').optional(),
      sortOrder: Joi.string().valid('asc', 'desc').optional()
    }), 'query'),
    getStudents
  );

router
  .route("/:id")
  /**
   * @route   GET /api/students/:id
   * @desc    Get a single student by ID.
   * @access  Protected (Admins, Principals, Teachers)
   */
  .get(
    protect,
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL, roles.TEACHER]),
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    getStudentById
  )
  /**
   * @route   PUT /api/students/:id
   * @desc    Update a student's details.
   * @access  Protected (Admins, Principals)
   */
  .put(
    protect,
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]),
    upload.single("passport"),
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    validate(Joi.object({
      name: commonSchemas.name.optional(),
      email: commonSchemas.email.optional(),
      phone: commonSchemas.phone.optional(),
      schoolId: commonSchemas.objectId.optional(),
      class: commonSchemas.class.optional(),
      section: commonSchemas.section.optional(),
      rollNumber: Joi.string().trim().max(20).optional(),
      dateOfBirth: Joi.date().iso().optional(),
      gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
      address: Joi.string().trim().max(500).optional(),
      parentId: commonSchemas.objectId.optional(),
      admissionNumber: Joi.string().trim().max(50).optional(),
      emergencyContact: Joi.object({
        name: commonSchemas.name.optional(),
        phone: commonSchemas.phone.optional(),
        relationship: Joi.string().trim().max(50).optional()
      }).optional(),
      medicalInfo: Joi.object({
        bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional(),
        allergies: Joi.array().items(Joi.string().trim().max(100)).optional(),
        medications: Joi.array().items(Joi.string().trim().max(100)).optional()
      }).optional()
    })),
    updateStudent
  )
  /**
   * @route   DELETE /api/students/:id
   * @desc    Delete a student.
   * @access  Protected (Admins, Principals)
   */
  .delete(
    protect,
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL]),
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    deleteStudent
  );


export default router;






