import cron from "node-cron";
import Notification from "../models/Notification.js";
import { deliverNotification } from "../services/notificationService.js";

/**
 * Finds and processes all due notifications.
 * This function is designed to be run by a scheduler.
 * @returns {Promise<{delivered: number, error?: string}>} An object indicating the number of notifications delivered or an error message.
 */
export const runNotificationSchedulerOnce = async () => {
  try {
    // Find notifications that are scheduled and whose time has come.
    const dueNotifications = await Notification.find({
      status: "scheduled",
      notifyAt: { $lte: new Date() },
    }).populate("user", "name email deviceTokens"); // Populate user to get device tokens

    if (dueNotifications.length === 0) {
      return { delivered: 0 };
    }

    // Process each notification.
    for (const notification of dueNotifications) {
      await deliverNotification(notification);
    }

    return { delivered: dueNotifications.length };
  } catch (error) {
    console.error("runNotificationSchedulerOnce error:", error.message);
    return { delivered: 0, error: error.message };
  }
};

/**
 * Starts the cron job to periodically check for and send scheduled notifications.
 */
export const startNotificationScheduler = () => {
  const cronExpression = process.env.NOTIFICATION_CRON || "*/1 * * * *";

  cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] notificationScheduler running...`);
    const { delivered, error } = await runNotificationSchedulerOnce();
    if (error) console.error(`[Scheduler] Error while running notification job: ${error}`);
    else if (delivered > 0) console.log(`[Scheduler] Successfully delivered ${delivered} notifications.`);
  });
};

