import asyncHandler from "express-async-handler";
import Subject from "../models/Subject.js";
import AppError from "../utils/AppError.js";
import { ok, created } from "../utils/ApiResponse.js";

/**
 * @desc    Create a new subject
 * @route   POST /api/subjects
 * @access  Private (Admins/Principals)
 */
export const createSubject = asyncHandler(async (req, res, next) => {
  let { name, code, stageScope, maxMark } = req.body;
  const schoolId = req.user.school;

  if (!name || !code) {
    return next(new AppError("Name and code are required for the subject.", 400));
  }

  code = code.toUpperCase().trim();
  if (maxMark !== undefined && (isNaN(maxMark) || Number(maxMark) <= 0)) {
    return next(new AppError("maxMark must be a positive number.", 400));
  }

  const subjectExists = await Subject.findOne({ school: schoolId, code });
  if (subjectExists) {
    return next(new AppError("A subject with this code already exists in your school.", 400));
  }

  const subject = await Subject.create({ school: schoolId, name, code, stageScope, maxMark });
  return created(res, subject, "Subject created successfully.");
});

/**
 * @desc    Get all subjects for a school
 * @route   GET /api/subjects
 * @access  Private (Admins/Principals/Teachers)
 */
export const getSubjects = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  const schoolId = req.user.school;

  const query = { school: schoolId };
  if (q) {
    const searchRegex = new RegExp(q, 'i');
    query.$or = [{ name: searchRegex }, { code: searchRegex }];
  }

  const count = await Subject.countDocuments(query);
  const subjects = await Subject.find(query)
    .limit(limit)
    .skip((page - 1) * limit)
    .sort({ name: 1 });

  return ok(res, {
    items: subjects,
    pagination: {
      total: count,
      page,
      pages: Math.ceil(count / limit) || 1,
      limit,
    }
  }, "Subjects retrieved successfully.");
});

/**
 * @desc    Get a single subject by ID
 * @route   GET /api/subjects/:id
 */
export const getSubjectById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const schoolId = req.user.school;
  const subject = await Subject.findOne({ _id: id, school: schoolId });
  if (!subject) {
    return next(new AppError("Subject not found or you do not have permission.", 404));
  }
  return ok(res, subject, "Subject retrieved successfully.");
});

/**
 * @desc    Update a subject
 * @route   PUT /api/subjects/:id
 * @access  Private (Admins/Principals)
 */
export const updateSubject = asyncHandler(async (req, res, next) => {
  const subject = await Subject.findOne({ _id: req.params.id, school: req.user.school });
  if (!subject) {
    return next(new AppError("Subject not found or you do not have permission.", 404));
  }

  const allowed = ['name', 'code', 'stageScope', 'maxMark'];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) {
      updates[key] = req.body[key];
    }
  }

  if (updates.code) {
    updates.code = updates.code.toUpperCase().trim();
    if (updates.code !== subject.code) {
      const exists = await Subject.findOne({ school: req.user.school, code: updates.code });
      if (exists) {
        return next(new AppError("Another subject with this code already exists.", 400));
      }
    }
  }

  if (updates.maxMark !== undefined && (isNaN(updates.maxMark) || Number(updates.maxMark) <= 0)) {
    return next(new AppError("maxMark must be a positive number.", 400));
  }

  Object.assign(subject, updates);
  const updatedSubject = await subject.save();
  return ok(res, updatedSubject, "Subject updated successfully.");
});

/**
 * @desc    Delete a subject
 * @route   DELETE /api/subjects/:id
 * @access  Private (Admins/Principals)
 */
export const deleteSubject = asyncHandler(async (req, res, next) => {
  const subject = await Subject.findOne({ _id: req.params.id, school: req.user.school });
  if (!subject) {
    return next(new AppError("Subject not found or you do not have permission.", 404));
  }
  await subject.deleteOne();
  return ok(res, { id: subject._id }, "Subject deleted successfully.");
});
