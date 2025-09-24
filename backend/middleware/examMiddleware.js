import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import AppError from "../utils/AppError.js";
import { roles } from "../config/roles.js";

/**
 * Middleware to check if a user is authorized for a specific exam.
 * Attaches the exam document to req.exam if successful.
 */
export const checkExamAccess = asyncHandler(async (req, res, next) => {
  const examId = req.params.examId || req.params.id;

  if (!mongoose.Types.ObjectId.isValid(examId)) {
    return next(new AppError("Invalid Exam ID format", 400));
  }

  const exam = await Exam.findById(examId);

  if (!exam) {
    return next(new AppError("Exam not found", 404));
  }

  // Global Super Admin is always authorized.
  if (req.user.role === roles.GLOBAL_SUPER_ADMIN) {
    req.exam = exam;
    return next();
  }

  // School-level users can only access exams within their own school.
  if (req.user.school?.toString() !== exam.school.toString()) {
    return next(new AppError("Forbidden: You do not have access to this exam.", 403));
  }

  req.exam = exam;
  return next();
});

