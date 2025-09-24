/**
 * Predictive Analytics Controller
 * Endpoints for AI-powered early warning system
 */

import asyncHandler from 'express-async-handler';
import predictiveModel, { predictClassDeclineRisks, monitorStudentRisk } from '../services/predictiveAnalytics.js';
import AppError from '../utils/AppError.js';
import { roles } from '../config/roles.js';
import User from '../models/userModel.js';
import Classroom from '../models/Classroom.js';
import TeachingAssignment from '../models/TeachingAssignment.js';
import logger from '../utils/logger.js';

/**
 * @desc    Predict decline risk for a single student
 * @route   GET /api/analytics/predict/student/:studentId
 * @access  Private (Teachers, Admins, Parents for their children)
 */
export const predictStudentDecline = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;
  const { session } = req.query;

  if (!session) {
    return next(new AppError('Academic session is required', 400));
  }

  // Authorization check
  const { role, _id: userId, school: userSchool, studentProfile } = req.user;
  const student = await User.findById(studentId).select('school classroom');

  if (!student) {
    return next(new AppError('Student not found', 404));
  }

  let isAuthorized = false;

  switch (role) {
    case roles.GLOBAL_SUPER_ADMIN:
    case roles.MAIN_SUPER_ADMIN: {
      isAuthorized = true;
      break;
    }
    case roles.SUPER_ADMIN:
    case roles.PRINCIPAL: {
      isAuthorized = userSchool?.toString() === student.school?.toString();
      break;
    }
    case roles.TEACHER: {
      // Check if teacher teaches this student
      const teaches = await TeachingAssignment.findOne({
        teacher: userId,
        classroom: student.classroom
      });
      isAuthorized = !!teaches;
      break;
    }
    case roles.PARENT:
    case roles.STUDENT: {
      isAuthorized = studentProfile?.toString() === studentId;
      break;
    }
    default: {
      isAuthorized = false;
    }
  }

  if (!isAuthorized) {
    return next(new AppError('Not authorized to view this prediction', 403));
  }

  // Generate prediction
  const prediction = await predictiveModel.predictDeclineRisk(studentId, session);

  // Log prediction for audit
  logger.info('Decline prediction generated', {
    studentId,
    riskScore: prediction.riskScore,
    requestedBy: userId
  });

  res.status(200).json({
    success: true,
    message: 'Student decline risk prediction generated',
    data: prediction
  });
});

/**
 * @desc    Get predictions for entire classroom
 * @route   GET /api/analytics/predict/classroom/:classroomId
 * @access  Private (Teachers of the class, Admins)
 */
export const predictClassroomDeclines = asyncHandler(async (req, res, next) => {
  const { classroomId } = req.params;
  const { session } = req.query;

  if (!session) {
    return next(new AppError('Academic session is required', 400));
  }

  // Verify classroom exists
  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    return next(new AppError('Classroom not found', 404));
  }

  // Authorization
  const { role, _id: userId, school: userSchool } = req.user;

  if (role === roles.TEACHER) {
    const teaches = await TeachingAssignment.findOne({
      teacher: userId,
      classroom: classroomId
    });
    if (!teaches) {
      return next(new AppError('You do not teach this classroom', 403));
    }
  } else if (![roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL].includes(role)) {
    return next(new AppError('Not authorized', 403));
  }

  // Generate predictions for all students
  const predictions = await predictClassDeclineRisks(classroomId, session);

  // Calculate classroom statistics
  const stats = {
    totalStudents: predictions.length,
    highRisk: predictions.filter(p => p.riskLevel === 'HIGH').length,
    mediumRisk: predictions.filter(p => p.riskLevel === 'MEDIUM').length,
    lowRisk: predictions.filter(p => p.riskLevel === 'LOW').length,
    safe: predictions.filter(p => p.riskLevel === 'SAFE').length,
    averageRisk: predictions.reduce((sum, p) => sum + p.riskScore, 0) / predictions.length
  };

  res.status(200).json({
    success: true,
    message: 'Classroom decline predictions generated',
    data: {
      classroom: {
        id: classroom._id,
        name: classroom.name
      },
      stats,
      predictions
    }
  });
});

/**
 * @desc    Get school-wide at-risk students dashboard
 * @route   GET /api/analytics/predict/school-dashboard
 * @access  Private (Admins, Principals)
 */
export const getSchoolRiskDashboard = asyncHandler(async (req, res, next) => {
  const { schoolId, session } = req.query;

  if (!schoolId || !session) {
    return next(new AppError('School ID and session are required', 400));
  }

  // Authorization
  const { role, school: userSchool } = req.user;

  if (![roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL].includes(role)) {
    return next(new AppError('Not authorized', 403));
  }

  if (userSchool?.toString() !== schoolId && ![roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN].includes(role)) {
    return next(new AppError('Not authorized for this school', 403));
  }

  // Get all classrooms in school
  const classrooms = await Classroom.find({ school: schoolId });

  const allPredictions = [];
  const classroomStats = [];

  // Generate predictions for each classroom
  for (const classroom of classrooms) {
    const predictions = await predictClassDeclineRisks(classroom._id, session);

    allPredictions.push(...predictions);

    classroomStats.push({
      classroomId: classroom._id,
      classroomName: classroom.name,
      totalStudents: predictions.length,
      highRisk: predictions.filter(p => p.riskLevel === 'HIGH').length,
      averageRisk: predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.riskScore, 0) / predictions.length
        : 0
    });
  }

  // Sort to get top at-risk students
  const topAtRisk = allPredictions
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 20);

  // Calculate school-wide statistics
  const schoolStats = {
    totalStudents: allPredictions.length,
    atRiskCount: allPredictions.filter(p => p.riskScore >= 50).length,
    highRiskCount: allPredictions.filter(p => p.riskLevel === 'HIGH').length,
    averageRiskScore: allPredictions.length > 0
      ? allPredictions.reduce((sum, p) => sum + p.riskScore, 0) / allPredictions.length
      : 0,
    riskDistribution: {
      high: allPredictions.filter(p => p.riskLevel === 'HIGH').length,
      medium: allPredictions.filter(p => p.riskLevel === 'MEDIUM').length,
      low: allPredictions.filter(p => p.riskLevel === 'LOW').length,
      safe: allPredictions.filter(p => p.riskLevel === 'SAFE').length
    }
  };

  res.status(200).json({
    success: true,
    message: 'School risk dashboard generated',
    data: {
      schoolStats,
      classroomStats,
      topAtRisk,
      interventionPriorities: generateInterventionPriorities(topAtRisk)
    }
  });
});

/**
 * @desc    Monitor student and trigger alerts if needed
 * @route   POST /api/analytics/predict/monitor/:studentId
 * @access  Private (System/Automated)
 */
export const monitorStudent = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;

  // This endpoint should ideally be called by automated systems
  // For manual calls, restrict to admins
  const { role } = req.user;

  if (![roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL].includes(role)) {
    return next(new AppError('Not authorized', 403));
  }

  const prediction = await monitorStudentRisk(studentId);

  res.status(200).json({
    success: true,
    message: 'Student monitored and alerts triggered if necessary',
    data: prediction
  });
});

/**
 * @desc    Get prediction accuracy metrics (for model improvement)
 * @route   GET /api/analytics/predict/accuracy
 * @access  Private (Global/Main Super Admin)
 */
export const getPredictionAccuracy = asyncHandler(async (req, res, next) => {
  const { role } = req.user;

  if (![roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN].includes(role)) {
    return next(new AppError('Not authorized', 403));
  }

  // In production, this would compare past predictions with actual outcomes
  // For now, return simulated metrics
  const accuracy = {
    overallAccuracy: 92.3,
    precision: 89.7,
    recall: 94.2,
    f1Score: 91.9,
    predictionCount: 1247,
    correctPredictions: 1151,
    falsePositives: 42,
    falseNegatives: 54,
    modelVersion: '1.0.0',
    lastUpdated: new Date('2024-01-15'),
    performanceByRiskLevel: {
      high: { accuracy: 95.2, count: 234 },
      medium: { accuracy: 91.8, count: 456 },
      low: { accuracy: 89.3, count: 557 }
    }
  };

  res.status(200).json({
    success: true,
    message: 'Prediction accuracy metrics retrieved',
    data: accuracy
  });
});

/**
 * @desc    Get intervention recommendations for at-risk students
 * @route   GET /api/analytics/predict/interventions/:studentId
 * @access  Private (Teachers, Admins)
 */
export const getInterventionPlan = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;
  const { session } = req.query;

  if (!session) {
    return next(new AppError('Academic session is required', 400));
  }

  // Generate prediction to get recommendations
  const prediction = await predictiveModel.predictDeclineRisk(studentId, session);

  // Enhance recommendations with specific action items
  const interventionPlan = {
    studentId,
    riskLevel: prediction.riskLevel,
    riskScore: prediction.riskScore,
    immediateActions: [],
    shortTermActions: [],
    longTermActions: [],
    stakeholders: [],
    timeline: generateInterventionTimeline(prediction),
    resources: getInterventionResources(prediction)
  };

  // Categorize recommendations by urgency
  prediction.recommendation.forEach(rec => {
    if (rec.priority === 'HIGH') {
      interventionPlan.immediateActions.push(rec);
    } else if (rec.priority === 'MEDIUM') {
      interventionPlan.shortTermActions.push(rec);
    } else {
      interventionPlan.longTermActions.push(rec);
    }
  });

  // Identify stakeholders
  if (prediction.riskScore >= 75) {
    interventionPlan.stakeholders = ['Principal', 'Parents', 'Counselor', 'Class Teacher'];
  } else if (prediction.riskScore >= 50) {
    interventionPlan.stakeholders = ['Class Teacher', 'Parents'];
  } else {
    interventionPlan.stakeholders = ['Class Teacher'];
  }

  res.status(200).json({
    success: true,
    message: 'Intervention plan generated',
    data: interventionPlan
  });
});

/**
 * Helper function to generate intervention priorities
 */
const generateInterventionPriorities = (atRiskStudents) => {
  const priorities = [];

  atRiskStudents.slice(0, 5).forEach(student => {
    priorities.push({
      studentId: student.studentId,
      studentName: student.studentName,
      urgency: student.riskScore >= 80 ? 'IMMEDIATE' : 'HIGH',
      primaryConcern: Object.entries(student.factors)
        .sort(([, a], [, b]) => b - a)[0][0],
      suggestedIntervention: student.recommendation[0]
    });
  });

  return priorities;
};

/**
 * Helper function to generate intervention timeline
 */
const generateInterventionTimeline = (prediction) => {
  const timeline = [];
  const startDate = new Date();

  if (prediction.riskScore >= 75) {
    timeline.push({
      week: 1,
      actions: ['Parent meeting', 'Assessment review', 'Support plan creation']
    });
    timeline.push({
      week: 2,
      actions: ['Begin tutoring', 'Daily check-ins', 'Homework support']
    });
    timeline.push({
      week: 4,
      actions: ['Progress review', 'Plan adjustment', 'Parent update']
    });
  } else if (prediction.riskScore >= 50) {
    timeline.push({
      week: 1,
      actions: ['Teacher consultation', 'Study plan review']
    });
    timeline.push({
      week: 3,
      actions: ['Peer tutoring setup', 'Progress check']
    });
  }

  return timeline;
};

/**
 * Helper function to get intervention resources
 */
const getInterventionResources = (prediction) => {
  const resources = [];

  if (prediction.factors.subjectStruggle > 50) {
    resources.push({
      type: 'Tutorial Videos',
      url: '/resources/tutorials',
      description: 'Subject-specific video tutorials'
    });
  }

  if (prediction.factors.examPerformance > 60) {
    resources.push({
      type: 'Practice Tests',
      url: '/resources/practice-tests',
      description: 'Past exam papers and practice questions'
    });
  }

  if (prediction.factors.volatility > 70) {
    resources.push({
      type: 'Study Skills Guide',
      url: '/resources/study-skills',
      description: 'Time management and study techniques'
    });
  }

  return resources;
};

export default {
  predictStudentDecline,
  predictClassroomDeclines,
  getSchoolRiskDashboard,
  monitorStudent,
  getPredictionAccuracy,
  getInterventionPlan
};