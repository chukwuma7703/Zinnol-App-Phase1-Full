import mongoose from "mongoose";

const annualResultSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Classroom",
    required: true,
  },
  session: {
    type: String,
    required: true, // e.g., "2025/2026"
  },
  // Store references to the term results used for this calculation
  termResults: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Result",
  }],
  // Aggregated annual data
  cumulativeScore: {
    type: Number,
    default: 0,
  },
  finalAverage: {
    type: Number,
    default: 0,
  },
  gradePoint: {
    type: String, // e.g., "A", "B+", or a numeric GPA like "3.5"
    default: "N/A",
  },
  annualPosition: {
    type: Number,
    default: 0,
  },
  promotionStatus: {
    type: String,
    enum: ["Promoted", "Not Promoted", "To Repeat", "Pending"],
    default: "Pending",
  },
}, { timestamps: true });

export default mongoose.model("AnnualResult", annualResultSchema);

