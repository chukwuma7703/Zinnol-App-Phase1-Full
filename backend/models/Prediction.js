/**
 * Prediction Model
 * Stores AI predictions for tracking accuracy and model improvement
 */

import mongoose from 'mongoose';

const predictionSchema = new mongoose.Schema({
  student: {
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
  
  session: {
    type: String,
    required: true,
    match: /^\d{4}\/\d{4}$/
  },
  
  // Prediction details
  riskScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  riskLevel: {
    type: String,
    required: true,
    enum: ['HIGH', 'MEDIUM', 'LOW', 'SAFE']
  },
  
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  // Individual risk factors
  factors: {
    gradeTrend: { type: Number, min: 0, max: 100 },
    volatility: { type: Number, min: 0, max: 100 },
    subjectStruggle: { type: Number, min: 0, max: 100 },
    examPerformance: { type: Number, min: 0, max: 100 },
    attendanceRate: { type: Number, min: 0, max: 100 },
    assignmentCompletion: { type: Number, min: 0, max: 100 },
    participationScore: { type: Number, min: 0, max: 100 },
    peerPerformance: { type: Number, min: 0, max: 100 },
    teacherConcerns: { type: Number, min: 0, max: 100 },
    seasonalPattern: { type: Number, min: 0, max: 100 }
  },
  
  // Predicted outcome
  predictedDeclineDate: {
    type: Date,
    default: null
  },
  
  predictedGradeChange: {
    type: Number, // Predicted percentage change in grades
    default: 0
  },
  
  // Recommendations generated
  recommendations: [{
    priority: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW']
    },
    action: String,
    description: String
  }],
  
  // Intervention tracking
  interventionStarted: {
    type: Boolean,
    default: false
  },
  
  interventionStartDate: {
    type: Date,
    default: null
  },
  
  interventionType: {
    type: String,
    enum: ['TUTORING', 'COUNSELING', 'PARENT_MEETING', 'STUDY_PLAN', 'PEER_SUPPORT', 'OTHER'],
    default: null
  },
  
  // Actual outcome (for accuracy tracking)
  actualOutcome: {
    declined: {
      type: Boolean,
      default: null
    },
    actualGradeChange: {
      type: Number,
      default: null
    },
    outcomeDate: {
      type: Date,
      default: null
    },
    outcomeVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  
  // Accuracy metrics
  predictionAccuracy: {
    type: Number, // Calculated after outcome is known
    min: 0,
    max: 100,
    default: null
  },
  
  // Model version for tracking improvements
  modelVersion: {
    type: String,
    default: '1.0.0'
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Alert tracking
  alertsSent: [{
    sentTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    alertType: {
      type: String,
      enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP']
    }
  }],
  
  // Feedback from teachers/admins
  feedback: [{
    providedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    },
    accuracyRating: {
      type: Number,
      min: 1,
      max: 5
    },
    comments: String,
    wasHelpful: Boolean
  }],
  
  // Status tracking
  status: {
    type: String,
    enum: ['ACTIVE', 'MONITORING', 'INTERVENED', 'RESOLVED', 'EXPIRED'],
    default: 'ACTIVE'
  },
  
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
predictionSchema.index({ student: 1, session: 1, createdAt: -1 });
predictionSchema.index({ school: 1, riskLevel: 1, status: 1 });
predictionSchema.index({ riskScore: -1, status: 1 });
predictionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Methods
predictionSchema.methods.calculateAccuracy = function() {
  if (!this.actualOutcome.declined === null) {
    return null;
  }
  
  // Simple accuracy calculation
  // In production, this would be more sophisticated
  const predictedDecline = this.riskScore >= 50;
  const actualDecline = this.actualOutcome.declined;
  
  if (predictedDecline === actualDecline) {
    // Correct prediction
    this.predictionAccuracy = 100 - Math.abs(this.riskScore - (actualDecline ? 100 : 0)) / 2;
  } else {
    // Incorrect prediction
    this.predictionAccuracy = Math.max(0, 50 - Math.abs(this.riskScore - 50));
  }
  
  return this.predictionAccuracy;
};

predictionSchema.methods.markAsIntervened = function(interventionType) {
  this.interventionStarted = true;
  this.interventionStartDate = new Date();
  this.interventionType = interventionType;
  this.status = 'INTERVENED';
  return this.save();
};

predictionSchema.methods.recordOutcome = function(declined, gradeChange, verifiedBy) {
  this.actualOutcome = {
    declined,
    actualGradeChange: gradeChange,
    outcomeDate: new Date(),
    outcomeVerifiedBy: verifiedBy
  };
  
  this.calculateAccuracy();
  this.status = 'RESOLVED';
  
  return this.save();
};

// Statics
predictionSchema.statics.getAccuracyStats = async function(schoolId, dateRange) {
  const match = {
    status: 'RESOLVED',
    predictionAccuracy: { $ne: null }
  };
  
  if (schoolId) {
    match.school = schoolId;
  }
  
  if (dateRange) {
    match.createdAt = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        avgAccuracy: { $avg: '$predictionAccuracy' },
        totalPredictions: { $sum: 1 },
        correctPredictions: {
          $sum: {
            $cond: [{ $gte: ['$predictionAccuracy', 70] }, 1, 0]
          }
        },
        highRiskAccuracy: {
          $avg: {
            $cond: [
              { $eq: ['$riskLevel', 'HIGH'] },
              '$predictionAccuracy',
              null
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    avgAccuracy: 0,
    totalPredictions: 0,
    correctPredictions: 0,
    highRiskAccuracy: 0
  };
};

predictionSchema.statics.getActiveHighRiskStudents = async function(schoolId) {
  const match = {
    status: { $in: ['ACTIVE', 'MONITORING'] },
    riskLevel: 'HIGH'
  };
  
  if (schoolId) {
    match.school = schoolId;
  }
  
  return this.find(match)
    .populate('student', 'name email')
    .populate('classroom', 'name')
    .sort({ riskScore: -1 })
    .limit(50);
};

const Prediction = mongoose.model('Prediction', predictionSchema);

export default Prediction;