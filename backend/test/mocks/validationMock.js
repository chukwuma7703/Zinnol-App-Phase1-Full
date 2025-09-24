// Test-only validation mock: pass-through middleware
import Joi from 'joi';

export const validate = () => (_req, _res, next) => next();

// Minimal common schemas used directly inside routes when composing Joi.object(...)
export const commonSchemas = {
    objectId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    email: Joi.string().email().lowercase().trim(),
    password: Joi.string(),
    name: Joi.string(),
    session: Joi.string(),
    term: Joi.number().integer(),
};

// Placeholder user schemas referenced by routes; validate() ignores them anyway in tests
export const userSchemas = {
    register: Joi.object({}),
    login: Joi.object({}),
    updateProfile: Joi.object({}),
    changePassword: Joi.object({}),
};

// Placeholder exam schemas referenced by routes
export const examSchemas = {
    getExams: Joi.object({}),
    createExam: Joi.object({}),
    addQuestion: Joi.object({}),
    examId: Joi.object({}),
    submissionId: Joi.object({}),
    submissionWithAnswerId: Joi.object({}),
    adjustExamTime: Joi.object({}),
    sendAnnouncement: Joi.object({}),
    studentExamHistory: Joi.object({}),
    studentExamHistoryQuery: Joi.object({}),
    invigilatorId: Joi.object({}),
    overrideAnswerScore: Joi.object({}),
};

export default { validate, userSchemas, examSchemas, commonSchemas };
