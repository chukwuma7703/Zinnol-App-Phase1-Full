import express from "express";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
} from "../controllers/teacherController.js";

const router = express.Router(); // eslint-disable-line new-cap

// Define roles that can manage teachers
const canCreateTeacher = [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL];
const canDeleteTeacher = [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN];

router
  .route("/")
  .post(protect, authorizeRoles(canCreateTeacher), createTeacher)
  .get(protect, getTeachers);

router
  .route("/:id")
  .get(protect, getTeacherById)
  .put(protect, updateTeacher)
  .delete(protect, authorizeRoles(canDeleteTeacher), deleteTeacher);

export default router;

