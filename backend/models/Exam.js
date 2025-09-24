import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: [true, "Exam title is required"],
      trim: true,
    },
    session: { type: String, required: true },
    term: { type: Number, required: true },

    totalMarks: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    durationInMinutes: {
      type: Number,
      min: 1,
    },
    maxPauses: {
      type: Number,
      default: 3, // Default number of pauses allowed
      min: 0,
    },
    // Optional scheduling window (when the exam is allowed to run)
    scheduledStartAt: { type: Date },
    scheduledEndAt: { type: Date },
  },
  { timestamps: true }
);

const Exam = mongoose.model("Exam", examSchema);

export default Exam;

