import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
    fileName: { type: String, required: true },
    url: { type: String, required: true },
    fileType: { type: String },
});

const assignmentSubmissionSchema = new mongoose.Schema({
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assignment',
        required: true,
        index: true,
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true,
    },
    submittedAt: {
        type: Date,
        default: Date.now,
    },
    attachments: [attachmentSchema],
    textSubmission: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        enum: ['pending', 'submitted', 'late', 'graded'],
        default: 'pending',
    },
    grade: {
        type: String,
        trim: true,
    },
    feedback: {
        type: String,
        trim: true,
    },
    gradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

assignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

const AssignmentSubmission = mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);

export default AssignmentSubmission;