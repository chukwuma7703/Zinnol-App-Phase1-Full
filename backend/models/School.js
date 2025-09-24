// models/School.js
import mongoose from "mongoose";

const gradeScaleSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  minScore: { type: Number, required: true },
  maxScore: { type: Number, required: true },
  remarks: { type: String, required: true }
}, { _id: false });

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String }, // Make email optional to handle existing data
    website: { type: String }, // Add optional website field
    description: { type: String }, // Add optional description field
    numberOfStudents: { type: Number, default: 0 }, // Add numberOfStudents field
    numberOfTeachers: { type: Number, default: 0 }, // Add numberOfTeachers field
    // For weather service
    lat: { type: Number },
    lng: { type: Number },
    mainSuperAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isActive: { type: Boolean, default: true },
    features: {
      type: Map,
      of: Boolean,
      default: {},
    },
    notifiedMilestones: {
      type: [Number],
      default: [],
    },
    // Custom grading system configuration
    gradingSystem: {
      type: { type: String, enum: ['WAEC', 'CAMBRIDGE', 'IB', 'CUSTOM'], default: 'WAEC' },
      customScale: [gradeScaleSchema],
      passingGrade: { type: String, default: 'E8' }, // Minimum grade to pass
      honorRollGrade: { type: String, default: 'B2' }, // Grade for honor roll
      lastUpdated: { type: Date, default: Date.now },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    // Academic calendar settings
    academicSettings: {
      currentSession: { type: String },
      currentTerm: { type: Number, min: 1, max: 3 },
      termDates: [{
        term: { type: Number, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true }
      }],
      gradingPeriods: { type: Number, default: 3 }, // Number of terms per session
      maxScore: { type: Number, default: 100 },
      minScore: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

const School = mongoose.model("School", schoolSchema);
export default School;
