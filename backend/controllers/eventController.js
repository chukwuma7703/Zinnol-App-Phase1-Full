import asyncHandler from "express-async-handler";
import Event from "../models/eventModel.js";
import AppError from "../utils/AppError.js";
import { ok, created } from "../utils/ApiResponse.js";

/**
 * @desc Create a new event
 * @route POST /api/events
 * @access Private/Teacher
 */
const createEvent = asyncHandler(async (req, res, next) => {
  const { title, date, startTime, endTime, location, description } = req.body;
  const { school } = req.user;

  if (!title || !date || !school) {
    return next(new AppError("Please add all fields", 400));
  }

  const event = await Event.create({
    school,
    title,
    date,
    startTime,
    endTime,
    location,
    description,
    createdBy: req.user._id,
  });

  if (!event) return next(new AppError("Invalid event data", 400));
  return created(res, event, "Event created successfully.");
});

/**
 * @desc Get all events for a school
 * @route GET /api/events
 * @access Private
 */
const getEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ school: req.user.school }).sort({ date: 1 });
  return ok(res, events, "Events retrieved successfully.");
});

/**
 * @desc Update an event
 * @route PUT /api/events/:id
 * @access Private/Teacher
 */
const updateEvent = asyncHandler(async (req, res, next) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return next(new AppError("Event not found", 404));
  }

  if (event.school.toString() !== req.user.school.toString()) {
    return next(new AppError("Not authorized to update this event", 401));
  }

  const updatedEvent = await Event.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  return ok(res, updatedEvent, "Event updated successfully.");
});

/**
 * @desc Delete an event
 * @route DELETE /api/events/:id
 * @access Private/Teacher
 */
const deleteEvent = asyncHandler(async (req, res, next) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return next(new AppError("Event not found", 404));
  }

  if (event.school.toString() !== req.user.school.toString()) {
    return next(new AppError("Not authorized to delete this event", 401));
  }

  await event.remove();

  return ok(res, { id: req.params.id }, "Event deleted successfully.");
});

export { createEvent, getEvents, updateEvent, deleteEvent };
