import asyncHandler from "express-async-handler";
import School from "../models/School.js";
import User from "../models/userModel.js";
import AppError from "../utils/AppError.js";
import { roles } from "../config/roles.js";

/**
 * Middleware to check if a user has access to a specific school.
 * It finds the school by ID from the route parameters, verifies the user's
 * permissions, and attaches the school object to the request if successful.
 *
 * Access Rules:
 * - GLOBAL_SUPER_ADMIN: Can access any school.
 * - MAIN_SUPER_ADMIN: Can only access schools they are explicitly assigned to as an owner.
 * - Other roles (SUPER_ADMIN, PRINCIPAL, etc.): Can only access the school they belong to.
 */
export const checkSchoolAccess = asyncHandler(async (req, res, next) => {
  const schoolId = req.params.id;
  const user = req.user;

  const school = await School.findById(schoolId);
  if (!school) {
    return next(new AppError("School not found", 404));
  }

  // Global admin has universal access.
  if (user.role === roles.GLOBAL_SUPER_ADMIN) {
    req.school = school;
    return next();
  }

  // Main Super Admin must be in the school's list of owners.
  if (user.role === roles.MAIN_SUPER_ADMIN) {
    if (!school.mainSuperAdmins.map(id => id.toString()).includes(user._id.toString())) {
      return next(new AppError("Forbidden: You are not an owner of this school.", 403));
    }
  } else {
    // All other roles must belong to the school.
    if (user.school?.toString() !== school._id.toString()) {
      return next(new AppError("Forbidden: You can only manage your own school.", 403));
    }
  }

  req.school = school;
  next();
});

/**
 * Middleware to check if a student belongs to the school being accessed.
 * This should be used after `checkSchoolAccess`.
 */
export const checkStudentAccess = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;
  const { school } = req; // Assumes checkSchoolAccess has run

  if (!school) {
    // This indicates a developer error where middleware was not chained correctly.
    return next(new AppError("Server configuration error: checkSchoolAccess must be used before checkStudentAccess.", 500));
  }

  const student = await User.findById(studentId);
  if (!student || student.school?.toString() !== school._id.toString()) {
    return next(new AppError("Student not found in this school.", 404));
  }

  req.student = student;
  next();
});
