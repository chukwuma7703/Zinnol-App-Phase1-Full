import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  url: { type: String, required: true }, // URL to the file in cloud storage
  fileType: { type: String },
});

const assignmentSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true,
  },
  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    required: true,
    index: true,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Assignment title is required.'],
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    required: [true, 'Assignment description is required.'],
    trim: true,
    maxlength: 5000,
  },
  dueDate: {
    type: Date,
    required: [true, 'A due date is required.'],
  },
  attachments: [attachmentSchema],
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'draft',
  },
}, {
  timestamps: true,
});

assignmentSchema.index({ school: 1, classroom: 1, dueDate: -1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);

export default Assignment;