import express from "express";
import Joi from "joi";
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByYear,       // include here instead of separate import
} from "../controllers/calendarController.js";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import { validate, calendarSchemas } from "../middleware/validationMiddleware.js";

const router = express.Router(); // eslint-disable-line new-cap

// Only these roles can access/manage calendar
const allowedRoles = [
  roles.GLOBAL_SUPER_ADMIN,
  roles.MAIN_SUPER_ADMIN,
  roles.SUPER_ADMIN,
  roles.PRINCIPAL,
];

// Get events by year
router.get("/:schoolId/year/:year", protect, authorizeRoles(allowedRoles), validate(calendarSchemas.eventsByYear, 'params'), getEventsByYear);

// Get events by school
router.route("/:schoolId/:year")
  .get(protect, authorizeRoles(allowedRoles), validate(calendarSchemas.eventsBySchoolYear, 'params'), getEventsByYear);

// Add a new event
router.route("/")
  .get(protect, authorizeRoles(allowedRoles), validate(calendarSchemas.getEvents, 'query'), getEvents)
  .post(protect, authorizeRoles(allowedRoles), validate(calendarSchemas.createEvent), createEvent);

// Update or delete an event by ID
router.route("/:id")
  .put(protect, authorizeRoles(allowedRoles), validate(calendarSchemas.eventId, 'params'), validate(calendarSchemas.updateEvent), updateEvent)
  .delete(protect, authorizeRoles(allowedRoles), validate(calendarSchemas.eventId, 'params'), deleteEvent);

export default router;
