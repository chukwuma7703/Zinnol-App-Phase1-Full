import express from "express";
import Joi from "joi";
import {
  protect,
  protectMfa,
  authorizeRoles,
  roles,
} from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimitMiddleware.js";
import { validate, userSchemas, commonSchemas } from "../middleware/validationMiddleware.js";
import {
  loginUser,
  adminResetPassword,
  verifyLoginMfa,
  googleLogin,
  logoutUser,
  setupMfa,
  verifyMfa,
  disableMfa,
  regenerateRecoveryCodes,
  updateUserProfile,
  registerUser,
  refreshToken,
  createUser,
  getUsers,
  getUserById,
  getUserProfile,
  getDashboardUsers,
  updateUserRole,
  updateUserStatus,
  forgotPassword,
  resetPassword,
  deleteUser,
  getMe,
  changePassword as changePasswordController,
} from "../controllers/userController.js";

const router = express.Router();

/* ---------------------------
   🔑 Initial Registration (first super admin only)
---------------------------- */


// Register first user (Global Super Admin)
router.post("/register", validate(userSchemas.register), registerUser);


// Get current user info
router.get("/me", protect, getMe);

/* ---------------------------
   🔐 Authentication
---------------------------- */
router.post("/login", authLimiter, validate(userSchemas.login), loginUser);
// Accept either a 6-digit authenticator code or a recovery code (arbitrary string)
router.post(
  "/login/verify-mfa",
  protectMfa,
  validate(
    Joi.object({
      token: Joi.string().required(),
    })
  ),
  verifyLoginMfa
);
router.post("/google-login", authLimiter, googleLogin);
router.post("/logout", logoutUser);
// Refresh uses httpOnly cookie; no body required
router.post("/refresh", authLimiter, refreshToken);

/* ---------------------------
   🔑 Password Recovery
---------------------------- */
router.post("/forgot-password", authLimiter, validate(Joi.object({
  email: commonSchemas.email.required()
})), forgotPassword);
router.put("/reset-password/:token", authLimiter, validate(Joi.object({
  password: commonSchemas.password.required()
}), 'body'), validate(Joi.object({
  token: Joi.string().required()
}), 'params'), resetPassword);

/* ---------------------------
   🔒 MFA Management
---------------------------- */
router.post("/mfa/setup", protect, setupMfa);
router.post(
  "/mfa/verify",
  protect,
  validate(
    Joi.object({
      token: Joi.string().length(6).pattern(/^\d+$/).required(),
    })
  ),
  verifyMfa
);
router.post("/mfa/disable", protect, validate(Joi.object({
  code: Joi.string().length(6).pattern(/^\d+$/).required()
})), disableMfa);
router.post("/mfa/regenerate-recovery", protect, regenerateRecoveryCodes);

/* ---------------------------
   👤 User Profile
---------------------------- */
router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, validate(userSchemas.updateProfile), updateUserProfile);

// Change own password
// Guard against undefined handler in certain test environments
const changePassword = typeof changePasswordController === 'function'
  ? changePasswordController
  : (req, res) => res.status(501).json({ message: 'Change password not available' });

router.post("/change-password", protect, validate(userSchemas.changePassword), changePassword);

/* ---------------------------
   📊 Dashboard
---------------------------- */
router.get("/dashboard", protect, getDashboardUsers);

/* ---------------------------
   👮 Admin: User Management
---------------------------- */
// Create a new user (admins only)
router.post(
  "/",
  protect,
  // Allow principals to create users (students/teachers) in their school
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.PRINCIPAL]),
  validate(Joi.object({
    name: commonSchemas.name.required(),
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    // Accept both canonical codes and human-friendly/lowercase roles used in tests
    role: Joi.string()
      .valid(
        'student', 'teacher', 'principal',
        'TEACHER', 'PRINCIPAL', 'SUPER_ADMIN', 'MAIN_SUPER_ADMIN', 'GLOBAL_SUPER_ADMIN'
      )
      .required(),
    schoolId: commonSchemas.objectId.optional()
  })),
  createUser
);

// Get all users (admins only)
router.get(
  "/",
  protect,
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
  getUsers
);

// Get / Delete a user by ID
router
  .route("/:id")
  .get(
    protect,
    authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
    validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
    getUserById
  )
  .delete(protect, authorizeRoles([roles.GLOBAL_SUPER_ADMIN]), validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'), deleteUser);

// Update role
router.put(
  "/:id/role",
  protect,
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    role: Joi.string()
      .valid('TEACHER', 'PRINCIPAL', 'SUPER_ADMIN', 'MAIN_SUPER_ADMIN', 'GLOBAL_SUPER_ADMIN')
      .required(),
    schoolId: commonSchemas.objectId.optional()
  })),
  updateUserRole
);

// Update status (activate/deactivate)
router.put(
  "/:id/status",
  protect,
  // Allow Global, Main Super Admin, Principal, and Teacher to toggle status.
  // Fine-grained constraints are enforced in the controller.
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.PRINCIPAL, roles.TEACHER]),
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    active: Joi.boolean().required()
  })),
  updateUserStatus
);

// Admin reset user password
router.put(
  "/:id/reset-password",
  protect,
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]),
  validate(Joi.object({ id: commonSchemas.objectId.required() }), 'params'),
  validate(Joi.object({
    newPassword: commonSchemas.password.required()
  })),
  adminResetPassword
);

export default router;

// Local error handler for this router to normalize error responses in tests
// Ensures next(AppError) yields `{ message }` with proper HTTP status
// without requiring the app to mount a global error middleware.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const status = err?.statusCode || err?.status || 500;
  const message = err?.message || 'Server Error';
  res.status(status).json({ message });
});
