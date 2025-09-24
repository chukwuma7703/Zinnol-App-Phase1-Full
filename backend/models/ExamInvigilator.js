import mongoose from "mongoose";

const examInvigilatorSchema = new mongoose.Schema({
    exam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Exam",
        required: true,
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "School",
        required: true,
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, { timestamps: true });

// Prevent a teacher from being assigned to the same exam twice
examInvigilatorSchema.index({ exam: 1, teacher: 1 }, { unique: true });

// Index for quick lookups of a teacher's assignments
examInvigilatorSchema.index({ teacher: 1 });

const ExamInvigilator = mongoose.model("ExamInvigilator", examInvigilatorSchema);

export default ExamInvigilator;
