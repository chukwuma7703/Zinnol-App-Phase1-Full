import express from "express";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import {
  createClassroom,
  getClassrooms,
  updateClassroom,
  deleteClassroom,
} from "../controllers/classController.js";

const router = express.Router();

// Apply authentication to all class routes
router.use(protect);
const adminRoles = [
  roles.MAIN_SUPER_ADMIN,
  roles.SUPER_ADMIN,
  roles.PRINCIPAL,
];

router
  .route("/")
  .post(authorizeRoles(adminRoles), createClassroom)
  .get(getClassrooms); // Any authenticated user in the school can view classes

router.route("/:id")
  .put(authorizeRoles(adminRoles), updateClassroom)
  .delete(authorizeRoles(adminRoles), deleteClassroom);

export default router;
