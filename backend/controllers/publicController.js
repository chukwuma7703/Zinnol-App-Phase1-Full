import asyncHandler from "express-async-handler";
import ShareToken from "../models/ShareToken.js";
import AppError from "../utils/AppError.js";
import Result from "../models/Result.js";
import mongoose from "mongoose";

/**
 * @desc    Access a shared analytics report using a secure token.
 * @route   GET /api/public/analytics/:token
 * @access  Public
 */
export const getSharedAnalytics = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  const shareToken = await ShareToken.findOne({ token });

  if (!shareToken) {
    return next(new AppError("Invalid or expired link.", 404));
  }

  if (new Date() > shareToken.expiresAt) {
    return next(new AppError("This share link has expired.", 410)); // 410 Gone
  }

  // Call the appropriate analytics function based on the token type
  if (shareToken.type === "student-analytics") {
    const studentId = shareToken.targetId;

    // Fetch the student's performance history directly.
    // This logic is self-contained and avoids calling another controller.
    const performanceHistory = await Result.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId), status: "approved" } },
      { $sort: { session: 1, term: 1 } },
      {
        $group: {
          _id: "$session",
          terms: { $push: { term: "$term", average: "$average", position: "$position" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // For public links, we only return the high-level history for now.
    return res.json({
      message: "Student analytics retrieved successfully.",
      performanceHistory,
      termAnalysis: {}, // Return an empty object to match the expected structure.
    });
  }

  return next(new AppError("Unsupported analytics type for this share link.", 400));
});
