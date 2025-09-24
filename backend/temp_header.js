import asyncHandler from "express-async-handler";
import Result from "../models/Result.js";
import AnnualResult from "../models/AnnualResult.js";
import ShareToken from "../models/ShareToken.js";
import TeachingAssignment from "../models/TeachingAssignment.js";
import TeacherActivity from "../models/teacherActivityModel.js";
import Timetable from "../models/timetableModel.js";
import AppError from "../utils/AppError.js";
import mongoose from "mongoose";
import { roles } from "../config/roles.js";
import User from "../models/userModel.js";
import School from "../models/School.js";

const CRITICAL_SCORE_THRESHOLD = 40; // Define what a "failing" or "critical" score is.

// Helper function to get the previous academic session string
function getPreviousSession(session) {
  if (!session || !/^\d{4}\/\d{4}$/.test(session)) return null;
  const years = session.split('/').map(Number);
  return `${years[0] - 1}/${years[1] - 1}`;
}

/**
 * @desc    Get aggregated data for the global super admin dashboard.
 * @route   GET /api/analytics/global-overview
 * @access  Private/GlobalSuperAdmin
 */
export const getGlobalOverviewAnalytics = asyncHandler(async (req, res) => {
  // Use Promise.all for concurrent data fetching
  const [
    totalSchools,
    totalUsers,
    totalStudents,
    totalTeachers,
    totalParents,
    activeAdmins,
  ] = await Promise.all([
    School.countDocuments(),
    User.countDocuments(),
    User.countDocuments({ role: roles.STUDENT }),
    User.countDocuments({ role: roles.TEACHER }),
    User.countDocuments({ role: roles.PARENT }),
    User.countDocuments({
      role: { $in: [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL] },
      // This requires a `lastActivity` timestamp on your User model to be effective.
      // For now, this counts all users with these roles.
      // lastActivity: { $gte: new Date(new Date() - 7 * 24 * 60 * 60 * 1000) }
    }),
  ]);

