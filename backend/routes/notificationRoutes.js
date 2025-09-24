import express from "express";
import Joi from "joi";
import { getMyNotifications, markNotificationRead, sendPushNotification } from "../controllers/notificationController.js";
import { protect, authorizeRoles, roles } from "../middleware/authMiddleware.js";
import { validate, notificationSchemas } from "../middleware/validationMiddleware.js";


const router = express.Router(); // eslint-disable-line new-cap

// Get my notifications (stored in DB)
router.get("/me", protect, validate(notificationSchemas.getMyNotifications, 'query'), getMyNotifications);

// Mark one notification as read
router.patch("/:id/read", protect, validate(notificationSchemas.notificationId, 'params'), markNotificationRead);

// 🚀 Send push notification via Firebase
// This is a sensitive endpoint and should be protected.
// Here, we're using `protect` to ensure the user is logged in,
// and an `admin` middleware to ensure they have administrative privileges.
router.post("/send", protect, authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), validate(notificationSchemas.sendPushNotification), sendPushNotification);

export default router;
