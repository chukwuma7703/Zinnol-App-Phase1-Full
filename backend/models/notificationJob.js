// services/notificationJob.js
import cron from "node-cron";
import Notification from "./Notification.js";
import User from './userModel.js';
import nodemailer from "nodemailer";


// ================== Email Transporter ================== //
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,  // e.g. zinnol.noreply@gmail.com
    pass: process.env.EMAIL_PASS,  // App password
  },
});


// ================== Deliver Notification ================== //
export async function deliverNotification(notification) {
  try {
    const user = await User.findById(notification.user);

    if (!user) {
      console.warn(`⚠️ User not found for notification: ${notification._id}`);
      return;
    }

    // Example: Send Email
    if (user.email) {
      await transporter.sendMail({
        from: `"Zinnol Calendar" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `Reminder: ${notification.title}`,
        text: notification.message,
      });
      console.log(`✅ Email sent to ${user.email} for "${notification.title}"`);
    }

    // Example: In-App notification placeholder
    // emitSocketEvent(user._id, notification);

    // Mark as sent
    notification.sent = true;
    await notification.save();
  } catch (err) {
    console.error("❌ Error delivering notification:", err.message);
  }
}

// ================== Background Job ================== //
// Runs every minute
function startNotificationJob() {
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    const upcomingNotifications = await Notification.find({
      sent: false,
      notifyAt: { $lte: now },   // ✅ fixed from "scheduleTime"
    });

    if (upcomingNotifications.length) {
      console.log(`🔔 Sending ${upcomingNotifications.length} notifications...`);
    }

    for (const notif of upcomingNotifications) {
      await deliverNotification(notif);
    }
  });

  console.log("✅ Notification job scheduler started");
}

export { startNotificationJob };
