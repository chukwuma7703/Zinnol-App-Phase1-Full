/**
 * Teacher Activity Model with AI Coaching Support
 * Tracks teaching sessions and stores AI-generated feedback
 */

import mongoose from 'mongoose';

const teacherActivitySchema = new mongoose.Schema({
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  classroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
    required: true
  },

  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },

  topic: {
    type: String,
    required: true,
    trim: true
  },

  // Session timing
  startTime: {
    type: Date,
    required: true,
    index: true
  },

  endTime: {
    type: Date
  },

  plannedDuration: {
    type: Number, // in minutes
    default: 45
  },

  durationInMinutes: {
    type: Number // Calculated when session ends
  },

  // Session details
  objectives: [{
    type: String,
    trim: true
  }],

  objectivesAchieved: [{
    type: String,
    trim: true
  }],

  studentsPresent: {
    type: Number,
    min: 0
  },

  // Teacher's reflection (minimum 100 words required)
  feedbackNote: {
    type: String,
    minlength: [100, 'Feedback note must be at least 100 characters'],
    trim: true
  },

  challengesFaced: [{
    type: String,
    trim: true
  }],

  // Session status
  status: {
    type: String,
    enum: ['planned', 'in-progress', 'completed', 'cancelled'],
    default: 'in-progress',
    index: true
  },

  completedAt: {
    type: Date
  },

  // AI Coaching Integration
  aiCoachingJobId: {
    type: String, // BullMQ job ID
    index: true
  },

  aiCoachingStatus: {
    type: String,
    enum: ['pending', 'queued', 'processing', 'completed', 'failed'],
    default: 'pending'
  },

  aiCoachingFeedback: {
    sessionId: mongoose.Schema.Types.ObjectId,
    teacherId: mongoose.Schema.Types.ObjectId,
    timestamp: Date,

    // Session summary
    summary: {
      subject: String,
      topic: String,
      duration: Number,
      classroom: String,
      sentiment: String,
      overallScore: Number
    },

    // Feedback sections
    strengths: [String],
    growthAreas: [String],
    suggestions: [String],

    // Resources
    resources: [{
      title: String,
      url: String,
      duration: String,
      type: String
    }],

    // Follow-up
    followUp: {
      actionItems: [String],
      checkInDate: Date,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high']
      }
    },

    // Metrics
    metrics: {
      engagementLevel: String,
      challengesAddressed: Number,
      successesIdentified: Number,
      reflectionQuality: Number
    }
  },

  coachingGeneratedAt: {
    type: Date
  },

  // Teacher's response to coaching
  coachingResponse: {
    helpful: Boolean,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    implementedSuggestions: [String],
    respondedAt: Date
  },

  // Teaching materials used
  materials: [{
    type: {
      type: String,
      enum: ['presentation', 'worksheet', 'video', 'interactive', 'other']
    },
    title: String,
    url: String
  }],

  // Student engagement metrics
  engagement: {
    participationRate: {
      type: Number,
      min: 0,
      max: 100
    },
    questionsAsked: Number,
    activitiesCompleted: Number
  },

  // Links to related data
  relatedExam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam'
  },

  relatedAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment'
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Tags for categorization
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],

  // Privacy settings
  visibility: {
    type: String,
    enum: ['private', 'school', 'public'],
    default: 'private'
  },

  // Allow sharing best practices
  shareable: {
    type: Boolean,
    default: false
  },

  sharedWith: [{
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for efficient querying
teacherActivitySchema.index({ teacher: 1, startTime: -1 });
teacherActivitySchema.index({ school: 1, status: 1 });
teacherActivitySchema.index({ classroom: 1, subject: 1 });
teacherActivitySchema.index({ aiCoachingStatus: 1, aiCoachingJobId: 1 });
teacherActivitySchema.index({ 'aiCoachingFeedback.summary.overallScore': -1 });
teacherActivitySchema.index({ tags: 1 });

// Virtual for session duration in hours
teacherActivitySchema.virtual('durationInHours').get(function () {
  return this.durationInMinutes ? (this.durationInMinutes / 60).toFixed(2) : null;
});

// Virtual for coaching available
teacherActivitySchema.virtual('hasCoaching').get(function () {
  return !!this.aiCoachingFeedback;
});

// Methods
teacherActivitySchema.methods.calculateDuration = function () {
  if (this.startTime && this.endTime) {
    this.durationInMinutes = Math.round((this.endTime - this.startTime) / 60000);
    return this.durationInMinutes;
  }
  return null;
};

teacherActivitySchema.methods.markCoachingCompleted = function (feedback) {
  this.aiCoachingStatus = 'completed';
  this.aiCoachingFeedback = feedback;
  this.coachingGeneratedAt = new Date();
  return this.save();
};

teacherActivitySchema.methods.markCoachingFailed = function (error) {
  this.aiCoachingStatus = 'failed';
  this.aiCoachingError = error;
  return this.save();
};

teacherActivitySchema.methods.rateCoaching = function (rating, feedback, helpful) {
  this.coachingResponse = {
    rating,
    feedback,
    helpful,
    respondedAt: new Date()
  };
  return this.save();
};

teacherActivitySchema.methods.implementSuggestion = function (suggestion) {
  if (!this.coachingResponse) {
    this.coachingResponse = {
      implementedSuggestions: []
    };
  }
  if (!this.coachingResponse.implementedSuggestions) {
    this.coachingResponse.implementedSuggestions = [];
  }
  if (!this.coachingResponse.implementedSuggestions.includes(suggestion)) {
    this.coachingResponse.implementedSuggestions.push(suggestion);
  }
  return this.save();
};

// Statics
teacherActivitySchema.statics.getTeacherStats = async function (teacherId, dateRange) {
  const match = { teacher: teacherId, status: 'completed' };

  if (dateRange) {
    match.startTime = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalMinutes: { $sum: '$durationInMinutes' },
        avgDuration: { $avg: '$durationInMinutes' },
        sessionsWithCoaching: {
          $sum: { $cond: [{ $ne: ['$aiCoachingFeedback', null] }, 1, 0] }
        },
        avgCoachingScore: {
          $avg: '$aiCoachingFeedback.summary.overallScore'
        },
        totalObjectivesSet: { $sum: { $size: '$objectives' } },
        totalObjectivesAchieved: { $sum: { $size: '$objectivesAchieved' } }
      }
    }
  ]);

  return stats[0] || {
    totalSessions: 0,
    totalMinutes: 0,
    avgDuration: 0,
    sessionsWithCoaching: 0,
    avgCoachingScore: 0,
    totalObjectivesSet: 0,
    totalObjectivesAchieved: 0
  };
};

teacherActivitySchema.statics.getBestPractices = async function (schoolId, limit = 10) {
  return this.find({
    school: schoolId,
    shareable: true,
    'aiCoachingFeedback.summary.overallScore': { $gte: 80 }
  })
    .sort({ 'aiCoachingFeedback.summary.overallScore': -1 })
    .limit(limit)
    .populate('teacher', 'name')
    .populate('subject', 'name')
    .populate('classroom', 'name');
};

teacherActivitySchema.statics.getStrugglingSessions = async function (schoolId, threshold = 50) {
  return this.find({
    school: schoolId,
    'aiCoachingFeedback.summary.overallScore': { $lt: threshold },
    'aiCoachingFeedback.followUp.priority': 'high'
  })
    .sort({ 'aiCoachingFeedback.summary.overallScore': 1 })
    .populate('teacher', 'name email')
    .populate('subject', 'name')
    .populate('classroom', 'name');
};

// Middleware
teacherActivitySchema.pre('save', function (next) {
  // Auto-calculate duration if both times are set
  if (this.isModified('endTime') && this.startTime && this.endTime) {
    this.calculateDuration();
  }

  // Set completed status if ended
  if (this.isModified('endTime') && this.endTime && this.status === 'in-progress') {
    this.status = 'completed';
    this.completedAt = this.endTime;
  }

  next();
});

const TeacherActivity = mongoose.model('TeacherActivity', teacherActivitySchema);

export default TeacherActivity;