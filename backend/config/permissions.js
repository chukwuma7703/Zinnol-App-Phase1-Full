// config/permissions.js
import { roles } from "../middleware/authMiddleware.js";

export const permissions = {
  createTeacher: [
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,  // added here
    roles.SUPER_ADMIN,
    roles.PRINCIPAL
  ],
  uploadResults: [
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,  // added here
    roles.SUPER_ADMIN,
    roles.PRINCIPAL,
    roles.TEACHER
  ],
  approveResults: [
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN,  // added here
    roles.SUPER_ADMIN,
    roles.PRINCIPAL
  ],
  createSuperAdmin: [
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN   // added here if you want main super admins to create other admins
  ],
  manageFeatures: [
    roles.GLOBAL_SUPER_ADMIN,
    roles.MAIN_SUPER_ADMIN   // added here if main super admins can toggle app functions
  ]
};
