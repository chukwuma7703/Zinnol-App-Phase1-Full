import * as nodemailer from "nodemailer";
import User from "../models/userModel.js";
import Notification from "../models/Notification.js";
import { getIO } from "../config/socket.js";
import { messaging } from "../config/firebaseAdmin.js";

/**
 * Send Email Notification
 */
const sendEmail = async (to, subject, text, html = null) => {
  if (!process.env.SMTP_HOST) {
    console.warn("⚠️ SMTP not configured. Skipping email notification.");
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT == 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      text,
      html: html || text, // fallback to plain text if no HTML
    });
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("sendEmail error:", error.message);
    return false;
  }
};

/**
 * Send Push Notification via Firebase
 */
const sendPush = async (user, title, body, data = {}) => {
  if (!messaging || !user.fcmTokens || user.fcmTokens.length === 0) {
    return null;
  }
  try {
    return await messaging.sendMulticast({
      notification: { title, body },
      data,
      tokens: user.fcmTokens,
    });
  } catch (error) {
    console.error("sendPush error:", error.message);
    return null;
  }
};

/**
 * Save and Send Auth Notification
 */
export const sendAuthNotificationToUser = async (userId, title, message, type = "auth", data = {}) => {
  try {
    await Notification.create({ user: userId, title, message, type, data });
    const user = await User.findById(userId).select("fcmTokens email");
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return { pushed: false, reason: "no-tokens" };
    }

    const response = await messaging.sendMulticast({
      notification: { title, body: message },
      data,
      tokens: user.fcmTokens,
    });

    // Remove invalid tokens
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error.code;
          if (
            errorCode === "messaging/registration-token-not-registered" ||
            errorCode === "messaging/invalid-registration-token"
          ) {
            tokensToRemove.push(user.fcmTokens[idx]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        user.fcmTokens = user.fcmTokens.filter(
          (token) => !tokensToRemove.includes(token)
        );
        await user.save();
      }
    }
    return {
      pushed: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("❌ Failed to create notification record:", error);
    return { pushed: false, reason: "db-error" };
  }
};

/**
 * Deliver a Saved Notification to User (Socket + Push + Email)
 */
export const deliverNotification = async (notification) => {
  try {
    const { user, title, message, event } = notification;
    if (!user) {
      notification.status = "failed";
      await notification.save();
      return;
    }

    // Socket.io
    const io = getIO();
    io.to(`user-${user._id}`).emit("newNotification", notification);

    // Push
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      await sendPush(user, title, message, { eventId: event?.toString() });
    }

    // Email
    if (user.email) {
      await sendEmail(user.email, title, message);
    }

    await Notification.findByIdAndUpdate(notification._id, {
      $set: {
        status: "sent",
        sentAt: new Date(),
        deliveryAttemptedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("deliverNotification error:", error.message);
    await Notification.findByIdAndUpdate(notification._id, {
      $set: { status: "failed", deliveryAttemptedAt: new Date() },
    });
  }
};

export { sendEmail, sendPush };
