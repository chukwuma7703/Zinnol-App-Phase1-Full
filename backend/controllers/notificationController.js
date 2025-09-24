// controllers/notificationController.js
import asyncHandler from "express-async-handler";
import Notification from "../models/Notification.js";
import { messaging } from "../config/firebaseAdmin.js";

// GET /api/notifications/me
export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const notifications = await Notification.find({ user: userId })
    .sort({ notifyAt: -1 })
    .limit(100)
    .populate("event", "title startDate location");
  res.json(notifications);
});

// PATCH /api/notifications/:id/read
export const markNotificationRead = asyncHandler(async (req, res) => {
  const notif = await Notification.findById(req.params.id);
  if (!notif) return res.status(404).json({ message: "Notification not found" });
  if (String(notif.user) !== String(req.user._id)) return res.status(403).json({ message: "Not allowed" });

  notif.isRead = true;
  await notif.save();
  res.json({ message: "Marked read" });
});

// POST /api/notifications/send
export const sendPushNotification = asyncHandler(async (req, res) => {
  const { token, title, body } = req.body;

  if (!token || !title || !body) {
    res.status(400);
    throw new Error("FCM token, title, and body are required");
  }

  const message = {
    notification: { title, body },
    token, // device FCM token
  };

  try {
    // Ensure the messaging service is available before trying to use it.
    if (!messaging) {
      res.status(503); // Service Unavailable
      throw new Error("Push notification service is not available. Check Firebase configuration.");
    }
    const response = await messaging.send(message);
    res.status(201).json({ success: true, messageId: response });
  } catch (error) {
    console.error("❌ Error sending notification via Firebase:", error);
    res.status(500);
    throw new Error("Failed to send push notification.");
  }
});
