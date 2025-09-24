import asyncHandler from "express-async-handler";
import Classroom from "../models/Classroom.js";
import User from "../models/userModel.js";
import AppError from "../utils/AppError.js";
import { roles } from "../config/roles.js";
import { ok, created } from "../utils/ApiResponse.js";

/**
 * @desc    Create a new classroom
 * @route   POST /api/classes
 * @access  Private (Admins)
 */
export const createClassroom = asyncHandler(async (req, res, next) => {
  // The frontend sends 'name', 'level', and 'teacherId'.
  // We adapt this to the 'Classroom' model's structure.
  const { name, level: levelString, teacherId } = req.body;
  const schoolId = req.user.school;

  if (!name || !levelString || !teacherId) {
    return next(new AppError('Please provide name, level, and a teacher ID.', 400));
  }

  // Basic parsing from the 'name' and 'level' fields from the form
  // This is a simple interpretation. You can make this more robust.
  const stageMatch = levelString.match(/^(jss|sss|basic|kg|creche)/i);
  const levelMatch = levelString.match(/\d+/);
  const sectionMatch = name.match(/[A-Z]$/i);

  const stage = stageMatch ? stageMatch[0].toLowerCase() : 'jss'; // Default stage
  const level = levelMatch ? parseInt(levelMatch[0], 10) : 1;
  const section = sectionMatch ? sectionMatch[0].toUpperCase() : 'A';

  // Verify the teacher exists, is a teacher, and belongs to the same school
  const teacher = await User.findOne({ _id: teacherId, school: schoolId, role: roles.TEACHER });
  if (!teacher) {
    return next(new AppError('Teacher not found or does not belong to your school.', 404));
  }

  const newClassroom = await Classroom.create({
    label: name, // Use the form's name as the label
    stage,
    level,
    section,
    teacher: teacherId,
    school: schoolId,
  });

  return created(res, newClassroom, 'Classroom created');
});

/**
 * @desc    Get all classrooms for a school with pagination and search
 * @route   GET /api/classes
 * @access  Private (School users)
 */
export const getClassrooms = asyncHandler(async (req, res, next) => {
  const schoolId = req.user.school;
  const { q, page = 1, limit = 10 } = req.query;

  const query = { school: schoolId };
  if (q) {
    // Search by the generated label
    query.label = { $regex: q, $options: 'i' };
  }

  const count = await Classroom.countDocuments(query);
  const classrooms = await Classroom.find(query)
    .populate('teacher', 'name') // Populate teacher's name for the UI
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ stage: 1, level: 1, section: 1 });

  // The frontend expects a 'classes' property, so we rename it here.
  return ok(res, {
    classes: classrooms,
    page: Number(page),
    pages: Math.ceil(count / limit),
    total: count,
  }, 'Classroom list');
});

/**
 * @desc    Update a classroom
 * @route   PUT /api/classes/:id
 * @access  Private (Admins)
 */
export const updateClassroom = asyncHandler(async (req, res, next) => {
  const { name, level: levelString, teacherId } = req.body;
  const schoolId = req.user.school;

  const classToUpdate = await Classroom.findOne({ _id: req.params.id, school: schoolId });

  if (!classToUpdate) {
    return next(new AppError('Classroom not found in your school.', 404));
  }

  if (teacherId) {
    const teacher = await User.findOne({ _id: teacherId, school: schoolId, role: roles.TEACHER });
    if (!teacher) {
      return next(new AppError('Assigned teacher not found or does not belong to your school.', 404));
    }
    classToUpdate.teacher = teacherId;
  }

  // Update fields from the form
  classToUpdate.label = name || classToUpdate.label;

  // You can add more sophisticated parsing for updates if needed
  if (levelString) {
    const stageMatch = levelString.match(/^(jss|sss|basic|kg|creche)/i);
    const levelMatch = levelString.match(/\d+/);
    classToUpdate.stage = stageMatch ? stageMatch[0].toLowerCase() : classToUpdate.stage;
    classToUpdate.level = levelMatch ? parseInt(levelMatch[0], 10) : classToUpdate.level;
  }

  const updatedClassroom = await classToUpdate.save();
  const populatedClassroom = await updatedClassroom.populate('teacher', 'name');

  return ok(res, populatedClassroom, 'Classroom updated');
});

/**
 * @desc    Delete a classroom
 * @route   DELETE /api/classes/:id
 * @access  Private (Admins)
 */
export const deleteClassroom = asyncHandler(async (req, res, next) => {
  const schoolId = req.user.school;
  const classToDelete = await Classroom.findOne({ _id: req.params.id, school: schoolId });

  if (!classToDelete) {
    return next(new AppError('Classroom not found in your school.', 404));
  }

  // The pre-hook on the model will prevent deletion if students are present.
  await classToDelete.deleteOne();

  return ok(res, { message: 'Classroom removed successfully.' }, 'Classroom deleted');
});