// models/TeachingAssignment.js
import mongoose from "mongoose";

const teachingAssignmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

teachingAssignmentSchema.index({ classroom: 1, subject: 1 }, { unique: true });

const TeachingAssignment = mongoose.model("TeachingAssignment", teachingAssignmentSchema);
export default TeachingAssignment;
