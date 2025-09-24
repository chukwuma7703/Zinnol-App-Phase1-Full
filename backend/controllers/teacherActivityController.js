/**
 * Teacher Activity Controller with AI Coaching Integration
 * Tracks teaching sessions and provides AI-powered feedback
 */

import asyncHandler from 'express-async-handler';
import TeacherActivity from '../models/teacherActivityModel.js';
import { queueCoachingAnalysis } from '../queues/coachingQueue.js';
import aiCoach from '../services/aiPedagogicalCoach.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { roles } from '../config/roles.js';

/**
 * @desc    Start a teaching session
 * @route   POST /api/activity/start
 * @access  Private (Teachers)
 */
export const startTeachingSession = asyncHandler(async (req, res, next) => {
  const { classroomId, subjectId, topic, plannedDuration, objectives } = req.body;

  // Validate required fields
  if (!classroomId || !subjectId || !topic) {
    return next(new AppError('Classroom, subject, and topic are required', 400));
  }

  // Check for existing active session
  const activeSession = await TeacherActivity.findOne({
    teacher: req.user._id,
    status: 'in-progress'
  });

  if (activeSession) {
    return next(new AppError('You already have an active teaching session', 400));
  }

  // Create new session
  const session = await TeacherActivity.create({
    teacher: req.user._id,
    school: req.user.school,
    classroom: classroomId,
    subject: subjectId,
    topic,
    plannedDuration: plannedDuration || 45,
    objectives: objectives || [],
    startTime: new Date(),
    status: 'in-progress'
  });

  logger.info(`Teaching session started by ${req.user._id} for ${topic}`);

  res.status(201).json({
    success: true,
    message: 'Teaching session started successfully',
    data: session
  });
});

/**
 * @desc    End a teaching session with feedback
 * @route   PATCH /api/activity/:id/end
 * @access  Private (Teachers)
 */
export const endTeachingSession = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { feedbackNote, studentsPresent, objectivesAchieved, challengesFaced } = req.body;

  // Validate feedback note
  if (!feedbackNote) {
    return next(new AppError('Feedback note is required', 400));
  }

  // Check word count (minimum 100 words)
  const wordCount = feedbackNote.trim().split(/\s+/).length;
  if (wordCount < 100) {
    return next(new AppError(`Feedback note must be at least 100 words (current: ${wordCount} words)`, 400));
  }

  // Find and validate session
  const session = await TeacherActivity.findById(id);

  if (!session) {
    return next(new AppError('Teaching session not found', 404));
  }

  if (session.teacher.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only end your own sessions', 403));
  }

  if (session.status !== 'in-progress') {
    return next(new AppError('This session has already ended', 400));
  }

  // Calculate duration
  const endTime = new Date();
  const durationInMinutes = Math.round((endTime - session.startTime) / 60000);

  // Update session
  session.endTime = endTime;
  session.durationInMinutes = durationInMinutes;
  session.feedbackNote = feedbackNote;
  session.studentsPresent = studentsPresent || null;
  session.objectivesAchieved = objectivesAchieved || [];
  session.challengesFaced = challengesFaced || [];
  session.status = 'completed';
  session.completedAt = endTime;

  await session.save();

  // Queue AI coaching analysis (asynchronous)
  try {
    const jobId = await queueCoachingAnalysis(session._id, {
      priority: determinePriority(feedbackNote),
      teacherId: req.user._id,
      subject: session.subject
    });

    session.aiCoachingJobId = jobId;
    session.aiCoachingStatus = 'queued';
    await session.save();

    logger.info(`AI coaching queued for session ${session._id} with job ${jobId}`);
  } catch (error) {
    logger.error('Failed to queue AI coaching:', error);
    // Don't fail the request if coaching fails
  }

  res.status(200).json({
    success: true,
    message: 'Teaching session ended successfully. AI coaching feedback will be available shortly.',
    data: {
      session,
      aiCoachingQueued: !!session.aiCoachingJobId
    }
  });
});

/**
 * @desc    Get AI coaching feedback for a session
 * @route   GET /api/activity/:id/coaching
 * @access  Private (Teacher who created the session)
 */
export const getCoachingFeedback = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const session = await TeacherActivity.findById(id)
    .populate('subject', 'name')
    .populate('classroom', 'name level');

  if (!session) {
    return next(new AppError('Session not found', 404));
  }

  // Check authorization
  if (session.teacher.toString() !== req.user._id.toString() &&
    ![roles.PRINCIPAL, roles.SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
    return next(new AppError('Not authorized to view this feedback', 403));
  }

  if (!session.aiCoachingFeedback) {
    return res.status(200).json({
      success: true,
      message: 'AI coaching feedback not yet available',
      data: {
        status: session.aiCoachingStatus || 'pending',
        jobId: session.aiCoachingJobId
      }
    });
  }

  res.status(200).json({
    success: true,
    message: 'AI coaching feedback retrieved',
    data: session.aiCoachingFeedback
  });
});

/**
 * @desc    Get coaching history for a teacher
 * @route   GET /api/activity/coaching-history
 * @access  Private (Teachers for own history, Admins for any teacher)
 */
export const getCoachingHistory = asyncHandler(async (req, res, next) => {
  const { teacherId, limit = 10 } = req.query;

  // Determine which teacher's history to fetch
  let targetTeacherId = req.user._id;

  if (teacherId && teacherId !== req.user._id.toString()) {
    // Check if user has permission to view other teacher's history
    if (![roles.PRINCIPAL, roles.SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
      return next(new AppError('Not authorized to view other teachers\' coaching history', 403));
    }
    targetTeacherId = teacherId;
  }

  const history = await aiCoach.getCoachingHistory(targetTeacherId, parseInt(limit));

  res.status(200).json({
    success: true,
    message: 'Coaching history retrieved',
    data: history
  });
});

/**
 * @desc    Get teaching activity statistics
 * @route   GET /api/activity/stats
 * @access  Private (Teachers for own stats, Admins for school stats)
 */
export const getActivityStats = asyncHandler(async (req, res, next) => {
  const { teacherId, startDate, endDate } = req.query;

  const match = {};

  // Determine scope
  if (teacherId) {
    if (teacherId !== req.user._id.toString() &&
      ![roles.PRINCIPAL, roles.SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
      return next(new AppError('Not authorized to view other teachers\' statistics', 403));
    }
    match.teacher = teacherId;
  } else if (req.user.role === roles.TEACHER) {
    match.teacher = req.user._id;
  } else {
    match.school = req.user.school;
  }

  // Date range
  if (startDate && endDate) {
    match.startTime = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  // Aggregate statistics
  const stats = await TeacherActivity.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              totalMinutes: { $sum: '$durationInMinutes' },
              avgDuration: { $avg: '$durationInMinutes' },
              completedSessions: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
              },
              sessionsWithCoaching: {
                $sum: { $cond: [{ $ne: ['$aiCoachingFeedback', null] }, 1, 0] }
              }
            }
          }
        ],
        bySubject: [
          {
            $group: {
              _id: '$subject',
              sessions: { $sum: 1 },
              totalMinutes: { $sum: '$durationInMinutes' }
            }
          },
          {
            $lookup: {
              from: 'subjects',
              localField: '_id',
              foreignField: '_id',
              as: 'subjectInfo'
            }
          },
          { $unwind: '$subjectInfo' },
          {
            $project: {
              subject: '$subjectInfo.name',
              sessions: 1,
              totalMinutes: 1
            }
          }
        ],
        byClassroom: [
          {
            $group: {
              _id: '$classroom',
              sessions: { $sum: 1 },
              totalMinutes: { $sum: '$durationInMinutes' }
            }
          },
          {
            $lookup: {
              from: 'classrooms',
              localField: '_id',
              foreignField: '_id',
              as: 'classroomInfo'
            }
          },
          { $unwind: '$classroomInfo' },
          {
            $project: {
              classroom: '$classroomInfo.name',
              sessions: 1,
              totalMinutes: 1
            }
          }
        ],
        coachingMetrics: [
          {
            $match: { aiCoachingFeedback: { $exists: true } }
          },
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$aiCoachingFeedback.summary.overallScore' },
              avgReflectionQuality: { $avg: '$aiCoachingFeedback.metrics.reflectionQuality' },
              totalStrengths: { $sum: { $size: '$aiCoachingFeedback.strengths' } },
              totalSuggestions: { $sum: { $size: '$aiCoachingFeedback.suggestions' } }
            }
          }
        ],
        recentSessions: [
          { $sort: { startTime: -1 } },
          { $limit: 5 },
          {
            $project: {
              topic: 1,
              startTime: 1,
              durationInMinutes: 1,
              status: 1,
              hasCoaching: { $ne: ['$aiCoachingFeedback', null] }
            }
          }
        ]
      }
    }
  ]);

  const result = stats[0];

  res.status(200).json({
    success: true,
    message: 'Activity statistics retrieved',
    data: {
      overview: result.overview[0] || {},
      bySubject: result.bySubject,
      byClassroom: result.byClassroom,
      coachingMetrics: result.coachingMetrics[0] || {},
      recentSessions: result.recentSessions
    }
  });
});

/**
 * @desc    Get school-wide coaching analytics
 * @route   GET /api/activity/school-coaching-analytics
 * @access  Private (Admins only)
 */
export const getSchoolCoachingAnalytics = asyncHandler(async (req, res, next) => {
  // Check authorization
  if (![roles.PRINCIPAL, roles.SUPER_ADMIN, roles.GLOBAL_SUPER_ADMIN].includes(req.user.role)) {
    return next(new AppError('Not authorized to view school analytics', 403));
  }

  const { startDate, endDate } = req.query;

  const dateRange = {};
  if (startDate && endDate) {
    dateRange.start = new Date(startDate);
    dateRange.end = new Date(endDate);
  }

  const analytics = await aiCoach.getSchoolCoachingAnalytics(req.user.school, dateRange);

  // Get top performing teachers
  const topTeachers = await TeacherActivity.aggregate([
    {
      $match: {
        school: req.user.school,
        aiCoachingFeedback: { $exists: true }
      }
    },
    {
      $group: {
        _id: '$teacher',
        avgScore: { $avg: '$aiCoachingFeedback.summary.overallScore' },
        sessionCount: { $sum: 1 }
      }
    },
    { $match: { sessionCount: { $gte: 3 } } }, // At least 3 sessions
    { $sort: { avgScore: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'teacherInfo'
      }
    },
    { $unwind: '$teacherInfo' },
    {
      $project: {
        name: '$teacherInfo.name',
        avgScore: { $round: ['$avgScore', 1] },
        sessionCount: 1
      }
    }
  ]);

  res.status(200).json({
    success: true,
    message: 'School coaching analytics retrieved',
    data: {
      ...analytics,
      topTeachers
    }
  });
});

/**
 * @desc    Request immediate AI coaching (premium feature)
 * @route   POST /api/activity/:id/request-coaching
 * @access  Private (Teachers)
 */
export const requestImmediateCoaching = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const session = await TeacherActivity.findById(id);

  if (!session) {
    return next(new AppError('Session not found', 404));
  }

  if (session.teacher.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only request coaching for your own sessions', 403));
  }

  if (!session.feedbackNote) {
    return next(new AppError('Session must have feedback note for coaching', 400));
  }

  if (session.aiCoachingFeedback) {
    return res.status(200).json({
      success: true,
      message: 'Coaching feedback already available',
      data: session.aiCoachingFeedback
    });
  }

  // Process immediately (bypass queue for premium)
  try {
    const feedback = await aiCoach.analyzeFeedbackNote(session._id);

    res.status(200).json({
      success: true,
      message: 'AI coaching feedback generated',
      data: feedback
    });
  } catch (error) {
    logger.error('Immediate coaching failed:', error);
    return next(new AppError('Failed to generate coaching feedback', 500));
  }
});

/**
 * Helper: Determine priority based on feedback content
 */
function determinePriority(feedbackNote) {
  const urgentKeywords = ['urgent', 'crisis', 'emergency', 'serious', 'critical'];
  const highKeywords = ['struggling', 'difficult', 'challenge', 'problem', 'concern'];

  const lowerNote = feedbackNote.toLowerCase();

  if (urgentKeywords.some(keyword => lowerNote.includes(keyword))) {
    return 'high';
  }

  if (highKeywords.filter(keyword => lowerNote.includes(keyword)).length >= 2) {
    return 'high';
  }

  return 'normal';
}

export default {
  startTeachingSession,
  endTeachingSession,
  getCoachingFeedback,
  getCoachingHistory,
  getActivityStats,
  getSchoolCoachingAnalytics,
  requestImmediateCoaching
};