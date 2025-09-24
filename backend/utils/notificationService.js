// services/notificationService.js
import Notification from "../models/notificationModel.js";
import User from "../models/userModel.js";
import { roles } from "../middleware/authMiddleware.js";
import { getReminderTimes } from "../utils/dateUtils.js";

// Roles allowed to receive notifications
const notificationRoles = [
  roles.MAIN_SUPER_ADMIN,
  roles.SUPER_ADMIN,
  roles.PRINCIPAL,
  roles.TEACHER,
  roles.STUDENT,
  roles.PARENT,
];

/**
 * Create notifications for an event
 * @param {Object} event - Mongoose event document
 */
export async function createEventNotifications(event) {
  if (!event.startDate) return;

  // Use allowed roles OR event.notifyRoles if specified
  const rolesToNotify = event.notifyRoles?.length
    ? event.notifyRoles.filter(r => notificationRoles.includes(r))
    : notificationRoles;

  if (!rolesToNotify.length) return;

  // Clean old notifications
  await Notification.deleteMany({ event: event._id });

  // Find users by role
  const users = await User.find({ role: { $in: rolesToNotify } });
  if (!users.length) return;

  // Generate reminders
  const reminderTimes = getReminderTimes(new Date(event.startDate));
  const notifications = [];

  for (const user of users) {
    for (const notifyAt of reminderTimes) {
      if (notifyAt > new Date()) {  // skip past times
        notifications.push({
          user: user._id,
          event: event._id,
          title: `Upcoming Event: ${event.title}`,
          message: `Reminder: ${event.title} at ${event.location} starts at ${event.startDate.toLocaleString()}`,
          notifyAt,
        });
      }
    }
  }

  if (notifications.length) {
    await Notification.insertMany(notifications);
  }
}
