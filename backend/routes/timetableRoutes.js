import express from "express";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import {
  createTimetableEntry,
  getTimetable,
  deleteTimetableEntry,
} from "../controllers/timetableController.js";

const canManageTimetables = [
  roles.PRINCIPAL,
  roles.SUPER_ADMIN,
  roles.MAIN_SUPER_ADMIN,
  roles.GLOBAL_SUPER_ADMIN,
];

const router = express.Router();

router
  .route("/")
  .get(protect, getTimetable)
  .post(protect, authorizeRoles(canManageTimetables), createTimetableEntry);

router.route("/:id").delete(protect, authorizeRoles(canManageTimetables), deleteTimetableEntry);

export default router;
