import mongoose from "mongoose";
import { roles } from "../config/roles.js";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional for role-based notifications
  role: { type: String, enum: Object.values(roles) }, // optional for general notifications
  event: { type: mongoose.Schema.Types.ObjectId, ref: "CalendarEvent" }, // optional for event notifications
  title: { type: String }, // event title or general title
  message: { type: String, required: true },
  type: { // For categorizing notifications, e.g., 'auth', 'event', 'result'
    type: String,
    default: "general",
  },
  data: { type: Map, of: String }, // For storing extra data for deep linking, etc.
  status: {
    type: String,
    enum: ["unsent", "scheduled", "sent", "failed"],
    default: "unsent",
  },
  isRead: { type: Boolean, default: false },
  notifyAt: { type: Date }, // required for event reminders
  sentAt: { type: Date }, // when it was actually sent
  deliveryAttemptedAt: { type: Date }, // when the scheduler last tried to send it
}, { timestamps: true });

export default mongoose.model("Notification", notificationSchema);
