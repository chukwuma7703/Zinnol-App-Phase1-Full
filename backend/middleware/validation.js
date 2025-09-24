import { body, param, query, validationResult } from 'express-validator';
import logger from '../utils/logger.js';

/**
 * Validation error handler
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
    }));

    logger.warn('Validation failed', {
      requestId: req.id,
      errors: formattedErrors,
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formattedErrors,
    });
  }

  next();
};

/**
 * Common validation rules
 */
export const commonValidations = {
  // MongoDB ObjectId validation
  mongoId: (field) =>
    param(field)
      .isMongoId()
      .withMessage(`Invalid ${field} ID`),

  // Email validation
  email: (field = 'email') =>
    body(field)
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),

  // Password validation
  password: (field = 'password') =>
    body(field)
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character'),

  // Phone validation
  phone: (field = 'phone') =>
    body(field)
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number'),

  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sort')
      .optional()
      .isString()
      .withMessage('Sort must be a string'),
  ],

  // Date validation
  date: (field) =>
    body(field)
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid date format'),

  // URL validation
  url: (field) =>
    body(field)
      .optional()
      .isURL()
      .withMessage('Invalid URL'),
};

/**
 * User validation rules
 */
export const userValidations = {
  register: [
    commonValidations.email(),
    commonValidations.password(),
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters'),
    body('role')
      .optional()
      .isIn(['student', 'teacher', 'parent', 'admin'])
      .withMessage('Invalid role'),
    handleValidationErrors,
  ],

  login: [
    commonValidations.email(),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    handleValidationErrors,
  ],

  update: [
    commonValidations.mongoId('id'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters'),
    commonValidations.phone(),
    handleValidationErrors,
  ],

  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    commonValidations.password('newPassword'),
    body('confirmPassword')
      .custom((value, { req }) => value === req.body.newPassword)
      .withMessage('Passwords do not match'),
    handleValidationErrors,
  ],
};

/**
 * School validation rules
 */
export const schoolValidations = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('School name must be between 2 and 100 characters'),
    commonValidations.email(),
    body('address')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('Address must be between 5 and 200 characters'),
    body('type')
      .isIn(['primary', 'secondary', 'tertiary'])
      .withMessage('Invalid school type'),
    commonValidations.phone(),
    commonValidations.url('website'),
    body('location.coordinates')
      .optional()
      .isArray({ min: 2, max: 2 })
      .withMessage('Coordinates must be [longitude, latitude]'),
    handleValidationErrors,
  ],

  update: [
    commonValidations.mongoId('id'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('School name must be between 2 and 100 characters'),
    commonValidations.email(),
    commonValidations.phone(),
    commonValidations.url('website'),
    handleValidationErrors,
  ],
};

/**
 * Student validation rules
 */
export const studentValidations = {
  create: [
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    commonValidations.email(),
    body('admissionNumber')
      .trim()
      .notEmpty()
      .withMessage('Admission number is required'),
    body('school')
      .isMongoId()
      .withMessage('Invalid school ID'),
    body('class')
      .isMongoId()
      .withMessage('Invalid class ID'),
    commonValidations.date('dateOfBirth'),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other'])
      .withMessage('Invalid gender'),
    body('parent.email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid parent email'),
    commonValidations.phone('parent.phone'),
    handleValidationErrors,
  ],

  update: [
    commonValidations.mongoId('id'),
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    commonValidations.email(),
    handleValidationErrors,
  ],

  bulkUpload: [
    body('students')
      .isArray({ min: 1 })
      .withMessage('Students array is required'),
    body('students.*.firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required'),
    body('students.*.lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required'),
    body('students.*.admissionNumber')
      .trim()
      .notEmpty()
      .withMessage('Admission number is required'),
    handleValidationErrors,
  ],
};

/**
 * Result validation rules
 */
export const resultValidations = {
  create: [
    body('student')
      .isMongoId()
      .withMessage('Invalid student ID'),
    body('session')
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('Session must be in format YYYY-YYYY'),
    body('term')
      .isIn(['First Term', 'Second Term', 'Third Term'])
      .withMessage('Invalid term'),
    body('subjects')
      .isArray({ min: 1 })
      .withMessage('At least one subject is required'),
    body('subjects.*.name')
      .trim()
      .notEmpty()
      .withMessage('Subject name is required'),
    body('subjects.*.score')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Score must be between 0 and 100'),
    handleValidationErrors,
  ],

  update: [
    commonValidations.mongoId('id'),
    body('subjects.*.score')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Score must be between 0 and 100'),
    handleValidationErrors,
  ],
};

/**
 * Exam validation rules
 */
export const examValidations = {
  create: [
    body('title')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Title must be between 3 and 100 characters'),
    body('subject')
      .isMongoId()
      .withMessage('Invalid subject ID'),
    body('class')
      .isMongoId()
      .withMessage('Invalid class ID'),
    body('duration')
      .isInt({ min: 1, max: 300 })
      .withMessage('Duration must be between 1 and 300 minutes'),
    body('totalMarks')
      .isInt({ min: 1, max: 200 })
      .withMessage('Total marks must be between 1 and 200'),
    body('startTime')
      .isISO8601()
      .toDate()
      .withMessage('Invalid start time'),
    body('endTime')
      .isISO8601()
      .toDate()
      .custom((value, { req }) => new Date(value) > new Date(req.body.startTime))
      .withMessage('End time must be after start time'),
    body('questions')
      .isArray({ min: 1 })
      .withMessage('At least one question is required'),
    handleValidationErrors,
  ],

  submit: [
    commonValidations.mongoId('id'),
    body('answers')
      .isArray()
      .withMessage('Answers must be an array'),
    body('answers.*.questionId')
      .isMongoId()
      .withMessage('Invalid question ID'),
    body('answers.*.answer')
      .notEmpty()
      .withMessage('Answer is required'),
    handleValidationErrors,
  ],
};

/**
 * File upload validation
 */
export const fileValidations = {
  image: (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
      });
    }

    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 5MB limit',
      });
    }

    next();
  },

  document: (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, DOC, DOCX, XLS, and XLSX are allowed',
      });
    }

    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit',
      });
    }

    next();
  },
};

export default {
  handleValidationErrors,
  commonValidations,
  userValidations,
  schoolValidations,
  studentValidations,
  resultValidations,
  examValidations,
  fileValidations,
};