import mongoose from "mongoose";

const answerSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  // For theory questions
  answerText: { type: String },
  // For objective questions
  selectedOptionIndex: { type: Number },
  // Populated after marking
  awardedMarks: { type: Number, default: 0 },
  // Fields for manual override by a teacher
  isOverridden: { type: Boolean, default: false },
  overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  overrideReason: { type: String, trim: true },

});

const studentExamSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    // Denormalized fields for faster history queries
    session: { type: String, required: true, index: true },
    term: { type: Number, required: true, index: true },
    // ---
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    status: {
      type: String,
      enum: ["ready", "in-progress", "paused", "submitted", "marked"],
      default: "ready",
    },
    startTime: { type: Date },
    endTime: { type: Date }, // The calculated time when the exam will end.
    answers: [answerSchema],
    timeRemainingOnPause: { type: Number }, // Stores remaining milliseconds when paused
    pauseCount: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    markedAt: { type: Date },
    markedBy: { type: String, enum: ["auto", "manual"], default: "auto" },
    isPublished: { type: Boolean, default: false }, // Tracks if the score has been posted to the main report card


  },
  
  {
    timestamps: true, // `createdAt` is when it started, `updatedAt` is last activity
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add a virtual property to calculate the duration the student took.
studentExamSchema.virtual("durationTaken").get(function () {
  // Only calculate if the exam was started and has been submitted.
  if (this.status === "submitted" && this.startTime) {
    // `updatedAt` is automatically set by mongoose on the save during finalization.
    const submissionTime = this.updatedAt;
    // Return the difference in minutes.
    return Math.round((submissionTime - this.startTime) / (1000 * 60));
  }
  return null;
});

// --- INDEXES ---
// Ensures a student can only have one submission per exam.
studentExamSchema.index({ exam: 1, student: 1 }, { unique: true });

// Speeds up queries for submissions by their status (e.g., finding all 'submitted' exams).
studentExamSchema.index({ status: 1 });

const StudentExam = mongoose.model("StudentExam", studentExamSchema);

export default StudentExam;
