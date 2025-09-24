/* eslint-disable no-invalid-this */

import mongoose from "mongoose";
import Student from "./Student.js"; // <-- don't forget to import Student, since you're using it below

// ==== ENUMS / CONSTANTS ====
const STAGES = ["creche", "kg", "basic", "jss", "sss"];
const SECONDARY_STREAMS = ["science", "arts", "commercial"];
const DEFAULT_CAPACITY = { creche: 50, kg: 200, basic: 250, jss: 300, sss: 300 };

// ==== SCHEMA ====
const classroomSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true
    },
    stage: {
      type: String,
      enum: STAGES,
      required: true
    },
    level: {
      type: Number,
      required: true,
      min: 1
    },
    stream: {
      type: String,
      enum: SECONDARY_STREAMS.concat(["general"]), // "general" for creche/nursery/primary
      default: "general"
    },
    section: {
      type: String,
      trim: true,
      default: "A",
      uppercase: true
    },
    label: {
      type: String,
      trim: true
    },
    // The main class teacher, which is required by the frontend form
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A class teacher must be assigned.'],
    },
    capacity: {
      type: Number,
      default: function () {
        // Schools can override manually — or leave empty for "no limit"
        return DEFAULT_CAPACITY[this.stage] || null;
      }
    },
    studentCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// === VIRTUAL: Remaining seats ===
classroomSchema.virtual("remainingSeats").get(function () {
  if (!this.capacity) return null; // unlimited.
  const remaining = this.capacity - (this.studentCount || 0);
  return remaining < 0 ? 0 : remaining;
});

// === AUTO LABEL GENERATION & VALIDATION ===
classroomSchema.pre("validate", function (next) {
  const stage = this.stage;
  const level = this.level;

  // Auto-generate label if it doesn't exist
  if (!this.label) {
    const stageLabel = {
      creche: "Creche",
      kg: "KG",
      basic: "Basic",
      jss: "J.S.S",
      sss: "S.S.S"
    }[stage] || stage;

    this.label = `${stageLabel} ${level}${this.section}`;
  }

  // Validate grade level for the given stage
  if (stage === "kg" && (level < 1 || level > 3)) {
    return next(new Error(`KG level must be between 1 and 3. Received: ${level}`));
  }
  if (stage === "basic" && (level < 1 || level > 6)) {
    return next(new Error(`Basic level must be between 1 and 6. Received: ${level}`));
  }
  if ((stage === "jss" || stage === "sss") && (level < 1 || level > 3)) {
    return next(new Error(`${stage.toUpperCase()} level must be between 1 and 3. Received: ${level}`));
  }
  next();
});

// === PREVENT DELETE IF STUDENTS EXIST ===
classroomSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  const count = await Student.countDocuments({ classroom: this._id });
  if (count > 0) {
    return next(new Error(`Cannot delete ${this.label} — it still has ${count} students.`));
  }
  next();
});

classroomSchema.pre("findOneAndDelete", async function (next) {
  const classroom = await this.model.findOne(this.getQuery());
  if (classroom) {
    const count = await Student.countDocuments({ classroom: classroom._id });
    if (count > 0) {
      return next(new Error(`Cannot delete ${classroom.label} — it still has ${count} students.`));
    }
  }
  next();
});

// === AUTO-UPDATE STUDENT COUNT ===
classroomSchema.statics.recalculateStudentCount = async function (classroomId) {
  const count = await Student.countDocuments({ classroom: classroomId, isActive: true });
  await this.findByIdAndUpdate(classroomId, { studentCount: count });
};

// === STATIC: SEED DEFAULT STRUCTURE ===
classroomSchema.statics.seedDefaultStructure = async function (schoolId, defaultTeacherId = null) {
  const stages = [
    { stage: "creche", maxLevel: 1 }, // e.g., Creche
    { stage: "kg", maxLevel: 3 }, // e.g., KG 1-3
    { stage: "basic", maxLevel: 6 }, // e.g., Basic 1-6
    { stage: "jss", maxLevel: 3 },
    { stage: "sss", maxLevel: 3 }
  ];

  const classes = [];
  for (const s of stages) {
    for (let lvl = 1; lvl <= s.maxLevel; lvl++) {
      classes.push({
        school: schoolId,
        stage: s.stage,
        level: lvl,
        section: "A",
        teacher: defaultTeacherId
      });
    }
  }

  return this.insertMany(classes);
};

// === STATIC: SEARCH STUDENTS (name or admission number) ===
classroomSchema.statics.searchStudents = async function (schoolId, query) {
  const regex = new RegExp(query, "i");
  return Student.find({
    school: schoolId,
    isActive: true,
    $or: [
      { admissionNumber: regex },
      { firstName: regex },
      { lastName: regex },
      { middleName: regex }
    ]
  }).populate("classroom", "label stage level section");
};

// === INDEXES (keep all indexing here) ===
classroomSchema.index({ school: 1, stage: 1, level: 1, section: 1 }, { unique: true });
classroomSchema.index({ isActive: 1 });
classroomSchema.index({ stage: 1 });
classroomSchema.index({ level: 1 });
classroomSchema.index({ school: 1 });

const Classroom = mongoose.model("Classroom", classroomSchema);
export default Classroom;
