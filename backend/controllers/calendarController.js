import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import CalendarEvent from "../models/calendarEventModel.js";
import User from "../models/userModel.js";
import { sendAuthNotificationToUser } from "../services/notificationService.js";
import { roles } from "../config/roles.js";
import AppError from "../utils/AppError.js";

// ------------------------------------------------------------------
// @desc    Get events by year (grouped by month/day)
// @route   GET /api/calendar/:schoolId/:year
// @access  Private
// ------------------------------------------------------------------
export const getEventsByYear = asyncHandler(async (req, res, next) => {
  const { schoolId, year } = req.params;

  if (!mongoose.Types.ObjectId.isValid(schoolId)) {
    return next(new AppError("Invalid schoolId", 400));
  }

  const startOfYear = new Date(`${year}-01-01T00:00:00Z`);
  const endOfYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00Z`);

  const events = await CalendarEvent.find({
    school: schoolId,
    startDate: { $gte: startOfYear, $lt: endOfYear },
  }).sort({ startDate: 1 });

  // Group by month → day
  const grouped = {};
  events.forEach(event => {
    const d = new Date(event.startDate);
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();

    if (!grouped[m]) grouped[m] = {};
    if (!grouped[m][day]) grouped[m][day] = [];
    grouped[m][day].push(event);
  });

  res.json({ year: parseInt(year), events: grouped });
});

// ------------------------------------------------------------------
// @desc    Get all events
// @route   GET /api/calendar
// @access  Private
// ------------------------------------------------------------------
export const getEvents = asyncHandler(async (req, res) => {
  const events = await CalendarEvent.find({ school: req.user.school }).populate("attendees", "name email deviceTokens");
  res.json(events);
});

// ------------------------------------------------------------------
// @desc    Create event + send notifications
// @route   POST /api/calendar
// @access  Private (Admins/Teachers/etc.)
// ------------------------------------------------------------------
export const createEvent = asyncHandler(async (req, res, next) => {
  const { title, description, startDate, endDate, isPrivate, attendees = [], attachments = [] } = req.body;

  const event = await CalendarEvent.create({
    title,
    description,
    startDate,
    endDate,
    isPrivate,
    attendees: isPrivate ? attendees : [],
    attachments,
    createdBy: req.user._id,
    school: req.user.school,
  });

  let recipients = [];
  if (isPrivate && attendees.length > 0) {
    recipients = await User.find({ _id: { $in: attendees } });
  } else if (!isPrivate) {
    recipients = await User.find({
      school: req.user.school,
      role: { $in: [roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.STUDENT, roles.PARENT] },
    });
  }

  for (const user of recipients) {
    await sendAuthNotificationToUser(
      user._id,
      `New Event: ${title}`,
      description || "A new event has been added to the calendar.",
      "event"
    );
  }

  res.status(201).json({ message: "Event created and notifications sent", event });
});

// ------------------------------------------------------------------
// @desc    Update event
// @route   PUT /api/calendar/:id
// @access  Private (Admin/Teacher)
// ------------------------------------------------------------------
export const updateEvent = asyncHandler(async (req, res, next) => {
  const eventToUpdate = await CalendarEvent.findById(req.params.id);
  if (!eventToUpdate) return next(new AppError("Event not found", 404));

  // Authorization check
  if (eventToUpdate.school.toString() !== req.user.school.toString()) {
    return next(new AppError("Forbidden: You can only update events in your own school.", 403));
  }

  const event = await CalendarEvent.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(event);
});

// ------------------------------------------------------------------
// @desc    Delete event
// @route   DELETE /api/calendar/:id
// @access  Private (Admin/Teacher)
// ------------------------------------------------------------------
export const deleteEvent = asyncHandler(async (req, res, next) => {
  const eventToDelete = await CalendarEvent.findById(req.params.id);
  if (!eventToDelete) return next(new AppError("Event not found", 404));

  // Authorization check
  if (eventToDelete.school.toString() !== req.user.school.toString()) {
    return next(new AppError("Forbidden: You can only delete events in your own school.", 403));
  }

  await CalendarEvent.findByIdAndDelete(req.params.id);
  res.json({ message: "Event removed" });
});
