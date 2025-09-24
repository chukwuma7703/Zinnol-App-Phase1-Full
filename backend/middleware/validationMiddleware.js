import Joi from 'joi';
import { ValidationError } from '../utils/AppError.js';

/**
 * Middleware to validate request data using Joi schemas
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Remove unknown properties
      convert: true // Convert types where possible
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return next(new ValidationError('Validation failed', details));
    }

    // Replace request data with validated/cleaned data
    req[property] = value;
    next();
  };
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // MongoDB ObjectId validation
  objectId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).message('Invalid ObjectId format'),

  // Email validation
  email: Joi.string().email().lowercase().trim(),

  // Password validation
  password: Joi.string()
    .min(6)
    .max(128),

  // Name validation
  name: Joi.string().trim().min(2).max(100),

  // Phone validation
  phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).message('Invalid phone number format'),

  // Address validation
  address: Joi.string().trim().min(5).max(500),

  // Class validation (e.g., "10", "Grade 10", "Class 10A")
  class: Joi.string().trim().min(1).max(50),

  // Section validation (e.g., "A", "B", "Section A")
  section: Joi.string().trim().min(1).max(50),

  // Session format (YYYY/YYYY)
  session: Joi.string().pattern(/^\d{4}\/\d{4}$/).message('Session must be in format YYYY/YYYY'),

  // Term validation (1-3)
  term: Joi.number().integer().min(1).max(3),

  // Positive integer
  positiveInt: Joi.number().integer().min(1),

  // Non-negative integer
  nonNegativeInt: Joi.number().integer().min(0),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().default('-createdAt')
  })
};

/**
 * Exam-related validation schemas
 */
export const examSchemas = {
  createExam: Joi.object({
    classroom: commonSchemas.objectId.required(),
    title: Joi.string().trim().min(3).max(200).required(),
    session: commonSchemas.session.required(),
    term: commonSchemas.term.required(),
    subject: commonSchemas.objectId.required(),
    durationInMinutes: commonSchemas.positiveInt.default(60),
    maxPauses: commonSchemas.nonNegativeInt.default(3)
  }),

  addQuestion: Joi.object({
    questionText: Joi.string().trim().min(10).max(2000).required(),
    questionType: Joi.string().valid('objective', 'theory').required(),
    marks: commonSchemas.positiveInt.required(),
    options: Joi.when('questionType', {
      is: 'objective',
      then: Joi.array().items(
        Joi.object({
          text: Joi.string().trim().min(1).max(500).required()
        })
      ).min(2).max(6).required(),
      otherwise: Joi.forbidden()
    }),
    correctOptionIndex: Joi.when('questionType', {
      is: 'objective',
      then: Joi.number().integer().min(0).required(),
      otherwise: Joi.forbidden()
    })
  }),

  submitAnswer: Joi.object({
    questionId: commonSchemas.objectId.required(),
    answerText: Joi.string().trim().max(5000),
    selectedOptionIndex: Joi.number().integer().min(0)
  }).or('answerText', 'selectedOptionIndex'),

  getExams: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    classroom: commonSchemas.objectId.optional(),
    subject: commonSchemas.objectId.optional(),
    session: commonSchemas.session.optional(),
    term: commonSchemas.term.optional(),
    status: Joi.string().valid('draft', 'published', 'ongoing', 'completed').optional(),
    sortBy: Joi.string().valid('title', 'createdAt', 'scheduledDate').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  }),

  examId: Joi.object({
    examId: commonSchemas.objectId.required()
  }),

  submissionId: Joi.object({
    submissionId: commonSchemas.objectId.required()
  }),

  submissionWithAnswerId: Joi.object({
    submissionId: commonSchemas.objectId.required(),
    answerId: commonSchemas.objectId.required()
  }),

  adjustExamTime: Joi.object({
    additionalMinutes: Joi.number().integer().min(1).max(120).required()
  }),

  sendAnnouncement: Joi.object({
    message: Joi.string().trim().min(1).max(500).required(),
    type: Joi.string().valid('info', 'warning', 'error').optional()
  }),

  assignInvigilator: Joi.object({
    teacherId: commonSchemas.objectId.required()
  }),

  invigilatorId: Joi.object({
    examId: commonSchemas.objectId.required(),
    teacherId: commonSchemas.objectId.required()
  }),

  studentExamHistory: Joi.object({
    studentId: commonSchemas.objectId.required()
  }),

  studentExamHistoryQuery: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(50).optional(),
    session: commonSchemas.session.optional(),
    term: commonSchemas.term.optional(),
    subject: commonSchemas.objectId.optional()
  }),

  overrideAnswerScore: Joi.object({
    newScore: Joi.number().min(0).required()
  })
};

/**
 * User-related validation schemas
 */
export const userSchemas = {
  register: Joi.object({
    name: commonSchemas.name.required(),
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    role: Joi.string().valid('TEACHER', 'PRINCIPAL', 'SUPER_ADMIN', 'MAIN_SUPER_ADMIN', 'GLOBAL_SUPER_ADMIN'),
    schoolId: commonSchemas.objectId
  }),

  login: Joi.object({
    email: commonSchemas.email.required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    name: commonSchemas.name,
    email: commonSchemas.email,
    phone: commonSchemas.phone
  }).min(1),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required()
  })
};

/**
 * Student-related validation schemas
 */
export const studentSchemas = {
  createStudent: Joi.object({
    firstName: commonSchemas.name.required(),
    lastName: commonSchemas.name.required(),
    admissionNumber: Joi.string().trim().min(1).max(50).required(),
    dateOfBirth: Joi.date().max('now').required(),
    gender: Joi.string().valid('Male', 'Female', 'Other').required(),
    classroom: commonSchemas.objectId.required(),
    school: commonSchemas.objectId.required(),
    parentEmail: commonSchemas.email,
    parentPhone: commonSchemas.phone
  }),

  updateStudent: Joi.object({
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    admissionNumber: Joi.string().trim().min(1).max(50),
    dateOfBirth: Joi.date().max('now'),
    gender: Joi.string().valid('Male', 'Female', 'Other'),
    classroom: commonSchemas.objectId,
    parentEmail: commonSchemas.email,
    parentPhone: commonSchemas.phone
  }).min(1)
};

/**
 * Result-related validation schemas
 */
export const resultSchemas = {
  createResult: Joi.object({
    student: commonSchemas.objectId.required(),
    classroom: commonSchemas.objectId.required(),
    session: commonSchemas.session.required(),
    term: commonSchemas.term.required(),
    subject: commonSchemas.objectId.required(),
    score: Joi.number().min(0).required(),
    maxScore: commonSchemas.positiveInt.required()
  }),

  bulkCreateResults: Joi.array().items(
    Joi.object({
      student: commonSchemas.objectId.required(),
      classroom: commonSchemas.objectId.required(),
      session: commonSchemas.session.required(),
      term: commonSchemas.term.required(),
      subject: commonSchemas.objectId.required(),
      score: Joi.number().min(0).required(),
      maxScore: commonSchemas.positiveInt.required()
    })
  ).min(1).max(1000),

  resultId: Joi.object({
    id: commonSchemas.objectId.required()
  }),

  resultIdParams: Joi.object({
    resultId: commonSchemas.objectId.required()
  }),

  rejectResult: Joi.object({
    reason: Joi.string().trim().min(1).max(500).required()
  }),

  generateAnnual: Joi.object({
    classroomId: commonSchemas.objectId.required(),
    session: commonSchemas.session.required()
  }),

  studentResults: Joi.object({
    studentId: commonSchemas.objectId.required()
  }),

  studentResultsQuery: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    session: commonSchemas.session.optional(),
    term: commonSchemas.term.optional(),
    subject: commonSchemas.objectId.optional(),
    classroom: commonSchemas.objectId.optional(),
    sortBy: Joi.string().valid('score', 'createdAt', 'subject').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  }),

  getAllResults: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    student: commonSchemas.objectId.optional(),
    classroom: commonSchemas.objectId.optional(),
    session: commonSchemas.session.optional(),
    term: commonSchemas.term.optional(),
    subject: commonSchemas.objectId.optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    sortBy: Joi.string().valid('score', 'createdAt', 'student', 'subject').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  })
};

/**
 * Calendar-related validation schemas
 */
export const calendarSchemas = {
  createEvent: Joi.object({
    schoolId: commonSchemas.objectId.required(),
    title: Joi.string().trim().min(1).max(200).required(),
    description: Joi.string().trim().max(1000).optional(),
    eventType: Joi.string().valid('holiday', 'exam', 'event', 'meeting', 'sports', 'cultural', 'other').required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    isAllDay: Joi.boolean().default(false),
    location: Joi.string().trim().max(200).optional(),
    priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
    reminder: Joi.boolean().default(false),
    reminderMinutes: Joi.when('reminder', {
      is: true,
      then: Joi.number().integer().min(5).max(1440).required(), // 5 minutes to 24 hours
      otherwise: Joi.forbidden()
    }),
    assignedTo: Joi.array().items(commonSchemas.objectId).optional(), // teachers/staff assigned
    tags: Joi.array().items(Joi.string().trim().max(50)).optional()
  }),

  updateEvent: Joi.object({
    title: Joi.string().trim().min(1).max(200).optional(),
    description: Joi.string().trim().max(1000).optional(),
    eventType: Joi.string().valid('holiday', 'exam', 'event', 'meeting', 'sports', 'cultural', 'other').optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    isAllDay: Joi.boolean().optional(),
    location: Joi.string().trim().max(200).optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    reminder: Joi.boolean().optional(),
    reminderMinutes: Joi.when('reminder', {
      is: true,
      then: Joi.number().integer().min(5).max(1440).required(),
      otherwise: Joi.forbidden()
    }),
    assignedTo: Joi.array().items(commonSchemas.objectId).optional(),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional()
  }).min(1),

  eventId: Joi.object({
    id: commonSchemas.objectId.required()
  }),

  eventsByYear: Joi.object({
    schoolId: commonSchemas.objectId.required(),
    year: Joi.number().integer().min(2000).max(2100).required()
  }),

  eventsBySchoolYear: Joi.object({
    schoolId: commonSchemas.objectId.required(),
    year: Joi.number().integer().min(2000).max(2100).required()
  }),

  getEvents: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    schoolId: commonSchemas.objectId.optional(),
    eventType: Joi.string().valid('holiday', 'exam', 'event', 'meeting', 'sports', 'cultural', 'other').optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    assignedTo: commonSchemas.objectId.optional(),
    sortBy: Joi.string().valid('startDate', 'createdAt', 'title', 'priority').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  })
};

/**
 * Notification-related validation schemas
 */
export const notificationSchemas = {
  sendPushNotification: Joi.object({
    title: Joi.string().trim().min(1).max(100).required(),
    body: Joi.string().trim().min(1).max(500).required(),
    recipientType: Joi.string().valid('all', 'school', 'role', 'individual').required(),
    schoolId: Joi.when('recipientType', {
      is: 'school',
      then: commonSchemas.objectId.required(),
      otherwise: Joi.forbidden()
    }),
    role: Joi.when('recipientType', {
      is: 'role',
      then: Joi.string().valid('STUDENT', 'TEACHER', 'PRINCIPAL', 'SUPER_ADMIN', 'MAIN_SUPER_ADMIN', 'GLOBAL_SUPER_ADMIN', 'PARENT').required(),
      otherwise: Joi.forbidden()
    }),
    recipientIds: Joi.when('recipientType', {
      is: 'individual',
      then: Joi.array().items(commonSchemas.objectId).min(1).max(1000).required(),
      otherwise: Joi.forbidden()
    }),
    data: Joi.object({
      type: Joi.string().valid('exam', 'result', 'announcement', 'calendar', 'general').optional(),
      referenceId: commonSchemas.objectId.optional(),
      actionUrl: Joi.string().uri().optional()
    }).optional(),
    priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
    ttl: Joi.number().integer().min(0).max(86400).optional() // Time to live in seconds (max 24 hours)
  }),

  notificationId: Joi.object({
    id: commonSchemas.objectId.required()
  }),

  getMyNotifications: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(50).optional(),
    read: Joi.boolean().optional(),
    type: Joi.string().valid('exam', 'result', 'announcement', 'calendar', 'general').optional(),
    sortBy: Joi.string().valid('createdAt', 'readAt').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  })
};

export default validate;
