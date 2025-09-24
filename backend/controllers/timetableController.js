import asyncHandler from "express-async-handler";
import Timetable from "../models/timetableModel.js";
import AppError from "../utils/AppError.js";
import { getCache, setCache } from "../config/cache.js";
import { ok, created } from "../utils/ApiResponse.js";

/**
 * @desc    Create a new timetable entry
 * @route   POST /api/timetables
 * @access  Private (Admins)
 */
export const createTimetableEntry = asyncHandler(async (req, res, next) => {
  const { school, classroom, subject, teacher, dayOfWeek, startTime, endTime } = req.body;

  // Authorization check: Ensure admin is creating for their own school
  if (req.user.school.toString() !== school) {
    return next(new AppError("Forbidden: You can only create timetables for your own school.", 403));
  }

  const entry = await Timetable.create({ school, classroom, subject, teacher, dayOfWeek, startTime, endTime });

  // Invalidate the cache for this classroom when its timetable changes
  const cacheKey = `timetable:${school}:${classroom}`;
  await setCache(cacheKey, null, 1); // Invalidate by setting a short TTL

  return created(res, entry, "Timetable entry created successfully.");
});

/**
 * @desc    Get timetable for a classroom
 * @route   GET /api/timetables
 * @access  Private
 */
export const getTimetable = asyncHandler(async (req, res, next) => {
  const { classroomId, schoolId = req.user.school } = req.query;
  const query = { school: schoolId };
  if (classroomId) query.classroom = classroomId;

  // --- Caching Logic ---
  const cacheKey = `timetable:${schoolId}:${classroomId || 'all'}`;
  const cachedTimetable = await getCache(cacheKey);
  if (cachedTimetable) {
    return ok(res, cachedTimetable, "Timetable retrieved successfully (cache).");
  }

  // --- Database Query (if not in cache) ---
  const timetable = await Timetable.find(query)
    .populate("classroom", "label")
    .populate("subject", "name")
    .populate("teacher", "name")
    .sort({ dayOfWeek: 1, startTime: 1 });

  // Store the result in the cache for next time (e.g., for 1 hour)
  await setCache(cacheKey, timetable, 3600);

  return ok(res, timetable, "Timetable retrieved successfully.");
});

/**
 * @desc    Delete a timetable entry
 * @route   DELETE /api/timetables/:id
 * @access  Private (Admins)
 */
export const deleteTimetableEntry = asyncHandler(async (req, res, next) => {
  const entry = await Timetable.findById(req.params.id);

  if (!entry) {
    return next(new AppError("Timetable entry not found.", 404));
  }

  if (req.user.school.toString() !== entry.school.toString()) {
    return next(new AppError("Forbidden: You cannot delete entries for another school.", 403));
  }

  await entry.deleteOne();
  return ok(res, { id: entry._id }, "Timetable entry deleted successfully.");
});
