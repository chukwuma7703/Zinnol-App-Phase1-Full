import express from "express";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import {
  createSubject,
  getSubjects,
  updateSubject,
  deleteSubject,
} from "../controllers/subjectController.js";

const router = express.Router();

const canManageSubjects = [
  roles.GLOBAL_SUPER_ADMIN,
  roles.MAIN_SUPER_ADMIN,
  roles.SUPER_ADMIN,
  roles.PRINCIPAL,
];

const canViewSubjects = [...canManageSubjects, roles.TEACHER];

router
  .route("/")
  .post(protect, authorizeRoles(canManageSubjects), createSubject)
  .get(protect, authorizeRoles(canViewSubjects), getSubjects);

router
  .route("/:id")
  .put(protect, authorizeRoles(canManageSubjects), updateSubject)
  .delete(protect, authorizeRoles(canManageSubjects), deleteSubject);

export default router;

