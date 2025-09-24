/* eslint-disable no-invalid-this */

import mongoose from "mongoose";
const resultItemSchema = new mongoose.Schema({
  // subject: { type: String, required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  caScore: { type: Number, default: 0 },   // e.g. Continuous Assessment
  examScore: { type: Number, default: 0 },
  maxCaScore: { type: Number, default: 40 }, // validation reference
  maxExamScore: { type: Number, default: 60 }, // validation reference
  total: { type: Number, default: 0 }
}, { _id: false });

const resultSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Classroom",
    required: true
  },
  term: { type: Number, required: true }, // 1,2,3
  session: { type: String, required: true }, // e.g. "2025/2026"
  items: [resultItemSchema],
  totalScore: { type: Number, default: 0 },
  average: { type: Number, default: 0 },
  position: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectionReason: { type: String, trim: true },
  // New fields for voice notes
  teacherVoiceNoteUrl: { type: String },
  principalVoiceNoteUrl: { type: String },

}, { timestamps: true });

// ---- AUTO CALCULATE TOTAL + AVERAGE BEFORE SAVE ----
resultSchema.pre("save", function (next) {
  // validate items do not exceed max score
  for (const item of this.items) {
    if (item.caScore > item.maxCaScore) {
      return next(new Error(`CA score for ${item.subject} exceeds max of ${item.maxCaScore}`));
    }
    if (item.examScore > item.maxExamScore) {
      return next(new Error(`Exam score for ${item.subject} exceeds max of ${item.maxExamScore}`));
    }
    item.total = item.caScore + item.examScore;
  }

  // compute total and average
  const sum = this.items.reduce((s, i) => s + i.total, 0);
  this.totalScore = sum;
  this.average = this.items.length > 0 ? sum / this.items.length : 0;

  next();
});

export default mongoose.model("Result", resultSchema);
