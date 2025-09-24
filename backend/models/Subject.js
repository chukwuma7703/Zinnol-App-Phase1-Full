// models/Subject.js
import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    stageScope: { 
      type: [String], 
      enum: ["KG", "BASIC", "JSS", "SSS"], 
      default: ["BASIC", "JSS", "SSS"] 
    }, // which stages use this subject
    maxMark: { type: Number, default: 100, min: 1, max: 100 }
  },
  { timestamps: true }
);

subjectSchema.index({ school: 1, code: 1 }, { unique: true });

const Subject = mongoose.model("Subject", subjectSchema);
export default Subject;
