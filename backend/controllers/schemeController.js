import asyncHandler from 'express-async-handler';
import SchemeOfWork, { Lesson } from '../models/SchemeOfWork.js';
import { ValidationError, AuthorizationError, NotFoundError } from '../utils/AppError.js';
import { normalizeSession, isValidSessionFormat, validateObjectId, validateTermNumeric, throwIfErrors } from '../utils/validationHelpers.js';
import { roles } from '../config/roles.js';
import { ok, created } from '../utils/ApiResponse.js';
import logger from '../utils/logger.js';

// POST /scheme - create scheme of work
export const createScheme = asyncHandler(async (req, res, next) => {
    const { subject, classroom, session, term, title, description, weeks = 12 } = req.body;
    const errors = [];
    validateObjectId(subject, 'subject', errors);
    validateObjectId(classroom, 'classroom', errors);
    if (!session) errors.push({ field: 'session', message: 'session is required' });
    let normSession = session;
    if (session) {
        normSession = normalizeSession(session);
        if (!isValidSessionFormat(normSession)) errors.push({ field: 'session', message: 'Invalid session format' });
    }
    validateTermNumeric(term, 'term', errors);
    if (!title) errors.push({ field: 'title', message: 'title is required' });
    try { throwIfErrors(errors, 'Create scheme validation failed'); } catch (e) { return next(e); }

    // Authorization: teacher or higher role
    if (![roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
        return next(new AuthorizationError('Not allowed to create scheme.'));
    }

    const scheme = await SchemeOfWork.create({
        school: req.user.school,
        subject,
        classroom,
        session: normSession.replace('-', '/'),
        term: Number(term),
        title,
        description,
        weeks: Number(weeks) || 12,
        createdBy: req.user._id,
    });
    logger.debug('Scheme created', { schemeId: scheme._id });
    return created(res, { scheme }, 'Scheme of work created');
});

// GET /scheme/:id - fetch scheme + progress + lessons
export const getScheme = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const errors = [];
    validateObjectId(id, 'id', errors);
    try { throwIfErrors(errors, 'Get scheme validation failed'); } catch (e) { return next(e); }
    const scheme = await SchemeOfWork.findById(id).lean();
    if (!scheme) return next(new NotFoundError('SchemeOfWork'));
    // Authorization: must belong to same school
    if (scheme.school.toString() !== req.user.school.toString()) {
        return next(new AuthorizationError('You do not have access to this scheme.'));
    }
    const lessons = await Lesson.find({ scheme: id }).lean();
    const progress = scheme.lessonsPlanned === 0 ? 0 : Math.round((scheme.lessonsCompleted / scheme.lessonsPlanned) * 100);
    return ok(res, { scheme, lessons, progress }, 'Scheme fetched');
});

// PATCH /lesson/:id/status - update lesson status
export const updateLessonStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params; const { status } = req.body;
    const errors = [];
    validateObjectId(id, 'id', errors);
    if (!['planned', 'in-progress', 'done'].includes(status || '')) errors.push({ field: 'status', message: 'Invalid status' });
    try { throwIfErrors(errors, 'Update lesson status validation failed'); } catch (e) { return next(e); }
    const lesson = await Lesson.findById(id);
    if (!lesson) return next(new NotFoundError('Lesson'));
    // Authorization: teacher who created scheme or admin roles
    if (![roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
        return next(new AuthorizationError('Not allowed to update lesson status.'));
    }
    lesson.status = status;
    await lesson.save();
    return ok(res, { lesson }, 'Lesson status updated');
});

// POST /lesson/:id/note - add lesson note
export const addLessonNote = asyncHandler(async (req, res, next) => {
    const { id } = req.params; const { content, resources = [] } = req.body;
    const errors = [];
    validateObjectId(id, 'id', errors);
    if (!content) errors.push({ field: 'content', message: 'content is required' });
    try { throwIfErrors(errors, 'Add lesson note validation failed'); } catch (e) { return next(e); }
    const lesson = await Lesson.findById(id);
    if (!lesson) return next(new NotFoundError('Lesson'));
    if (lesson.scheme) {
        const scheme = await SchemeOfWork.findById(lesson.scheme).select('school createdBy');
        if (scheme.school.toString() !== req.user.school.toString()) return next(new AuthorizationError('Cross-school access denied.'));
    }
    lesson.notes.push({ teacher: req.user._id, content, resources });
    await lesson.save();
    return created(res, { lessonId: lesson._id, notes: lesson.notes }, 'Lesson note added');
});

// POST /lesson/:id/review - principal/admin review note(s)
export const reviewLesson = asyncHandler(async (req, res, next) => {
    const { id } = req.params; const { status, comments } = req.body;
    const errors = [];
    validateObjectId(id, 'id', errors);
    if (!['approved', 'rejected', 'pending'].includes(status || '')) errors.push({ field: 'status', message: 'Invalid status' });
    try { throwIfErrors(errors, 'Review lesson validation failed'); } catch (e) { return next(e); }
    if (![roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
        return next(new AuthorizationError('Not allowed to review lessons.'));
    }
    const lesson = await Lesson.findById(id);
    if (!lesson) return next(new NotFoundError('Lesson'));
    lesson.reviews.push({ reviewer: req.user._id, status, comments });
    await lesson.save();
    return created(res, { lessonId: lesson._id, reviews: lesson.reviews }, 'Review added');
});

// POST /lesson/:id/feedback - parent feedback confirmation
export const addLessonFeedback = asyncHandler(async (req, res, next) => {
    const { id } = req.params; const { confirmation, comment } = req.body;
    const errors = [];
    validateObjectId(id, 'id', errors);
    if (typeof confirmation !== 'boolean') errors.push({ field: 'confirmation', message: 'confirmation boolean required' });
    try { throwIfErrors(errors, 'Add lesson feedback validation failed'); } catch (e) { return next(e); }
    if (![roles.PARENT, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
        return next(new AuthorizationError('Not allowed to give feedback.'));
    }
    const lesson = await Lesson.findById(id);
    if (!lesson) return next(new NotFoundError('Lesson'));
    lesson.feedback.push({ parent: req.user._id, confirmation, comment });
    await lesson.save();
    return created(res, { lessonId: lesson._id, feedback: lesson.feedback }, 'Feedback recorded');
});

// Utility to seed lessons (optional future enhancement)
export const seedLessons = asyncHandler(async (req, res) => {
    const { schemeId, topics = [] } = req.body;
    validateObjectId(schemeId, 'schemeId', []);
    const bulk = topics.map((t, idx) => ({
        scheme: schemeId,
        week: t.week || Math.floor(idx / 5) + 1,
        day: t.day || (idx % 5) + 1,
        topic: t.topic,
        objectives: t.objectives || [],
        subject: t.subject,
        classroom: t.classroom,
    }));
    await Lesson.insertMany(bulk);
    return created(res, { created: bulk.length }, 'Seed lessons created');
});
