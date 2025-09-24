import mongoose from "mongoose";

const timetableSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // ISO 8601 day of the week: 1 (Monday) - 7 (Sunday)
    dayOfWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
    },
    // Stored as "HH:mm" format
    startTime: { type: String, required: true }, // e.g., "09:00"
    endTime: { type: String, required: true }, // e.g., "10:00"
  },
  { timestamps: true }
);

timetableSchema.index({ school: 1, classroom: 1, dayOfWeek: 1, startTime: 1 }, { unique: true });

const Timetable = mongoose.model("Timetable", timetableSchema);
export default Timetable;

