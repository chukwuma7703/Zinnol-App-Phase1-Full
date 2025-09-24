/* eslint-disable no-invalid-this */

// models/Student.js
import mongoose from "mongoose";
import Classroom from "./Classroom.js";

// ===============================
// SCHEMA DEFINITION
// ===============================
const studentSchema = new mongoose.Schema(
  {
    // -------------------------------
    // Core Student & School Info
    // -------------------------------
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true, // Single index — no duplication elsewhere
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    admissionNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },

    // -------------------------------
    // Demographic & Personal Details
    // -------------------------------
    gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
    dateOfBirth: { type: Date },
    heightCm: { type: Number, min: 0 },
    hobbies: { type: [String], default: [] },
    bloodGroup: { type: String },
    address: { type: String },
    hometown: { type: String, trim: true },
    house: { type: String, trim: true }, // For leaderboard house points
    stateOfOrigin: { type: String, trim: true },



    // -------------------------------
    // Contact Information
    // -------------------------------
    studentPhone: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },

    // -------------------------------
    // Asset & Status Information
    // -------------------------------
    passportUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ===============================
// VIRTUALS
// ===============================
studentSchema.virtual("fullName").get(function () {
  const middle = this.middleName ? `${this.middleName} ` : "";
  return `${this.firstName} ${middle}${this.lastName}`.trim();
});

studentSchema.virtual("age").get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// ===============================
// HOOKS
// ===============================
studentSchema.pre("validate", function (next) {
  // Normalize gender case (allow 'male'/'female' -> 'Male'/'Female') before enum check
  if (typeof this.gender === 'string' && this.gender) {
    const g = this.gender.trim().toLowerCase();
    if (g === 'male') this.gender = 'Male';
    else if (g === 'female') this.gender = 'Female';
    else if (g === 'other') this.gender = 'Other';
  }
  if (this.isModified("dateOfBirth") && this.dateOfBirth && this.dateOfBirth > new Date()) {
    return next(new Error("Date of birth cannot be in the future."));
  }
  if (this.admissionNumber) {
    this.admissionNumber = this.admissionNumber.trim().toUpperCase();
  }
  next();
});

// Ensure classroom student count is updated after save/remove
studentSchema.post("save", async function () {
  if (this.classroom) {
    await Classroom.recalculateStudentCount(this.classroom);
  }
});
studentSchema.post("remove", async function () {
  if (this.classroom) {
    await Classroom.recalculateStudentCount(this.classroom);
  }
});

// ===============================
// STATICS
// ===============================
studentSchema.statics.findByFullName = async function (schoolId, query) {
  if (!query || query.trim() === "") return [];
  const searchRegex = new RegExp(query.trim(), "i");

  return this.aggregate([
    {
      $match: {
        school: new mongoose.Types.ObjectId(schoolId),
        isActive: true,
        $or: [
          { firstName: { $regex: searchRegex } },
          { lastName: { $regex: searchRegex } },
          { admissionNumber: { $regex: searchRegex } },
        ],
      },
    },
    {
      $project: {
        firstName: 1,
        lastName: 1,
        middleName: 1,
        admissionNumber: 1,
        fullName: {
          $trim: {
            input: {
              $concat: [
                "$firstName",
                " ",
                { $ifNull: ["$middleName", ""] },
                " ",
                "$lastName",
              ],
            },
          },
        },
      },
    },
    { $match: { fullName: { $regex: searchRegex } } },
    { $project: { fullName: 1, admissionNumber: 1 } },
    { $limit: 20 },
  ]);
};

studentSchema.statics.changeClassroom = async function (studentId, newClassroomId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const student = await this.findById(studentId).session(session);
    const newClassroom = await Classroom.findById(newClassroomId).session(session);

    if (!student) throw new Error("Student not found.");
    if (!newClassroom) throw new Error("New classroom not found.");

    // If classroom is unchanged, skip
    if (student.classroom?.toString() === newClassroomId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return student;
    }

    // Enforce capacity
    if (newClassroom.capacity && newClassroom.studentCount >= newClassroom.capacity) {
      throw new Error("New classroom is already full.");
    }

    const oldClassroomId = student.classroom;
    student.classroom = newClassroomId;
    await student.save({ session });

    if (oldClassroomId) {
      await Classroom.findByIdAndUpdate(oldClassroomId, { $inc: { studentCount: -1 } }, { session });
    }
    await Classroom.findByIdAndUpdate(newClassroomId, { $inc: { studentCount: 1 } }, { session });

    await session.commitTransaction();
    session.endSession();
    return student;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// ===============================
// INDEXES (No duplicates)
// ===============================
studentSchema.index({ school: 1, admissionNumber: 1 }, { unique: true });
// Removed direct index on isActive — covered in queries dynamically
studentSchema.index({ school: 1, classroom: 1 }); // still useful for classroom filtering

// ===============================
// EXPORT MODEL
// ===============================
const Student = mongoose.model("Student", studentSchema);
export default Student;
