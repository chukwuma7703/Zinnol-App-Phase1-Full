import mongoose from "mongoose";
import { roles } from "../config/roles.js";


const calendarEventSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  },
  title: {
    type: String,
    required: [true, "Please add a title"],
    trim: true,
  },
  description: {
    type: String,
    required: [true, "Please add a description"],
  },
  eventType: {
    type: String,
    trim: true,
  },
  startDate: {
    type: Date,
    required: [true, "Please add a start date"],
  },
  endDate: {
    type: Date,
    required: [true, "Please add an end date"],
  },
  location: {
    type: String,
    trim: true,
  },
  
  recurs: {
    type: Boolean,
    default: false,
  },
  recursUntil: {
    type: Date,
    required: false,
  },
  weather: {
    description: { type: String },
    temp: { type: Number },
    source: { type: String }, // "current" or "forecast"
  },
  // Fields for notifications and visibility
  notifyRoles: {
    type: [String],
    enum: Object.values(roles), // Use centralized roles for consistency
    default: [],
  },
  attendees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  isPrivate: {
    type: Boolean,
    default: false,
  },
  // Use a structured object for attachments for better frontend handling
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    _id: false, // No need for a separate ID on each attachment
  }],
  // Reference to the user who created the event
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, { timestamps: true });

// Add a compound index for faster queries when fetching a school's calendar
calendarEventSchema.index({ school: 1, startDate: -1 });

export default mongoose.model("CalendarEvent", calendarEventSchema);
