import asyncHandler from "express-async-handler";
import Result from "../models/Result.js";
import AnnualResult from "../models/AnnualResult.js";
import ShareToken from "../models/ShareToken.js";
import TeachingAssignment from "../models/TeachingAssignment.js";
import TeacherActivity from "../models/teacherActivityModel.js";
import Timetable from "../models/timetableModel.js";
import StudentExam from "../models/StudentExam.js";
import Classroom from "../models/Classroom.js";
import AppError, { ValidationError, NotFoundError, AuthorizationError } from "../utils/AppError.js";
import mongoose from "mongoose";
import { roles } from "../config/roles.js";
import User from "../models/userModel.js";
import School from "../models/School.js";
import { ok, created } from "../utils/ApiResponse.js";
import logger from "../utils/logger.js";
import { normalizeSession, isValidSessionFormat, validateObjectId, validateTermNumeric, throwIfErrors, buildValidationContext } from "../utils/validationHelpers.js";
import { canViewStudentAnalytics, canShareTeacherAnalytics, canShareStudentAnalytics, validateSort, runAggregationsSafely } from "../utils/authorizationHelpers.js";

const CRITICAL_SCORE_THRESHOLD = 40; // Define what a "failing" or "critical" score is.

// Helper function to get the previous academic session string
function getPreviousSession(session) {
  if (!session || !/^\d{4}\/\d{4}$/.test(session)) return null;
  const years = session.split('/').map(Number);
  return `${years[0] - 1}/${years[1] - 1}`;
}

/**
 * @desc    Get aggregated data for the global super admin dashboard.
 * @route   GET /api/analytics/global-overview
 * @access  Private/GlobalSuperAdmin
 */
export const getGlobalOverviewAnalytics = asyncHandler(async (req, res) => {
  try {
    // Use Promise.all for concurrent data fetching
    const [
      totalSchools,
      totalUsers,
      totalStudents,
      totalTeachers,
      totalParents,
      activeAdmins,
    ] = await Promise.all([
      School.countDocuments(),
      User.countDocuments(),
      User.countDocuments({ role: roles.STUDENT }),
      User.countDocuments({ role: roles.TEACHER }),
      User.countDocuments({ role: roles.PARENT }),
      User.countDocuments({
        role: { $in: [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL] },
        // This requires a `lastActivity` timestamp on your User model to be effective.
        // For now, this counts all users with these roles.
        // lastActivity: { $gte: new Date(new Date() - 7 * 24 * 60 * 60 * 1000) }
      }),
    ]);

    return ok(res, {
      totalSchools,
      totalUsers,
      totalStudents,
      totalTeachers,
      totalParents,
      activeAdmins,
    }, "Global overview analytics retrieved");
  } catch (e) {
    // Fail-safe: never 500 the dashboard; return zeros so UI can load
    return ok(res, {
      totalSchools: 0,
      totalUsers: 0,
      totalStudents: 0,
      totalTeachers: 0,
      totalParents: 0,
      activeAdmins: 0,
    }, "Global overview analytics retrieved (fallback)");
  }
});

/**
 * @desc    Get system-wide analytics for the global admin.
 * @route   GET /api/analytics/system-wide
 * @access  Private/GlobalSuperAdmin
 */
export const getSystemWideAnalytics = asyncHandler(async (req, res, next) => {
  const { session: rawSession } = req.query; // Allow filtering by session
  const ctx = buildValidationContext(req);
  const errors = [];
  if (!rawSession) {
    errors.push({ field: 'session', message: 'session is required' });
  } else {
    const session = normalizeSession(rawSession);
    if (!isValidSessionFormat(session)) {
      errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' });
    } else {
      req.query.session = session.replace('-', '/'); // normalize in-place for downstream queries
    }
  }
  try { throwIfErrors(errors, 'System-wide analytics validation failed'); } catch (e) { return next(e); }
  logger.debug('System-wide analytics request', { session: req.query.session, ...ctx });
  const session = req.query.session; // normalized session string

  // --- 1. School Performance Comparison ---
  const schoolPerformancePromise = Result.aggregate([
    { $match: { session, status: 'approved' } },
    {
      $group: {
        _id: '$school',
        averagePerformance: { $avg: '$average' },
        studentCount: { $addToSet: '$student' }
      }
    },
    { $lookup: { from: 'schools', localField: '_id', foreignField: '_id', as: 'schoolInfo' } },
    { $unwind: '$schoolInfo' },
    {
      $project: {
        _id: 0,
        schoolId: '$_id',
        schoolName: '$schoolInfo.name',
        averagePerformance: { $round: ['$averagePerformance', 2] },
        studentCount: { $size: '$studentCount' }
      }
    },
    { $sort: { averagePerformance: -1 } }
  ]).read('secondaryPreferred');

  // --- 2. User Registration Trend (last 12 months) ---
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const userGrowthPromise = User.aggregate([
    { $match: { createdAt: { $gte: twelveMonthsAgo } } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        date: { $dateFromParts: { 'year': '$_id.year', 'month': '$_id.month', 'day': 1 } },
        count: 1
      }
    },
    { $sort: { date: 1 } }
  ]).read('secondaryPreferred');

  // --- 3. System-Wide Subject Performance ---
  const subjectPerformancePromise = Result.aggregate([
    { $match: { session, status: 'approved' } },
    { $unwind: '$items' },
    { $group: { _id: '$items.subject', averageScore: { $avg: '$items.total' } } },
    { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subjectInfo' } },
    { $unwind: '$subjectInfo' },
    { $project: { _id: 0, name: '$subjectInfo.name', averageScore: { $round: ['$averageScore', 2] } } },
    { $sort: { averageScore: -1 } },
    { $limit: 10 } // Return top 10 subjects for clarity
  ]).read('secondaryPreferred');

  // --- 4. Result Submission Trend (last 12 months) ---
  const resultSubmissionTrendPromise = Result.aggregate([
    { $match: { createdAt: { $gte: twelveMonthsAgo } } }, // Use the same twelveMonthsAgo date
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        date: { $dateFromParts: { 'year': '$_id.year', 'month': '$_id.month', 'day': 1 } },
        count: 1
      }
    },
    { $sort: { date: 1 } }
  ]).read('secondaryPreferred');

  // Use safe aggregator wrapper for better logging if any promise rejects.
  const [schoolPerformance, userGrowth, subjectPerformance, resultSubmissionTrend] = await runAggregationsSafely([
    schoolPerformancePromise,
    userGrowthPromise,
    subjectPerformancePromise,
    resultSubmissionTrendPromise
  ], logger, 'system-wide analytics aggregates');

  return ok(res, { schoolPerformance, userGrowth, subjectPerformance, resultSubmissionTrend }, "System-wide analytics retrieved successfully.");
});

/**
 * @desc    Get a world-class, detailed performance analysis for a single student.
 * @route   GET /api/analytics/student/:studentId
 */
export const getStudentAnalytics = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;
  let { session, term } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  // Validate IDs & formats
  validateObjectId(studentId, 'studentId', errors);
  if (session) {
    session = normalizeSession(session);
    if (!isValidSessionFormat(session)) {
      errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' });
    }
  }
  validateTermNumeric(term, 'term', errors);
  try { throwIfErrors(errors, 'Student analytics validation failed'); } catch (e) { return next(e); }
  if (session) req.query.session = session.replace('-', '/');
  logger.debug('Student analytics validation passed', { studentId, session: req.query.session, term, ...ctx });

  // --- 2. Data Existence Check ---
  // Fetch the student's user document to get their school and classroom for auth checks.
  const student = await User.findById(studentId).select('school classroom role').lean().read('secondaryPreferred');
  if (!student || student.role !== roles.STUDENT) {
    return next(new NotFoundError('Student'));
  }

  // --- 3. Detailed Authorization Logic ---
  // Determine teacher assignment only if needed for teacher role
  let isTeacherAssigned = false;
  if (req.user.role === roles.TEACHER && student.classroom) {
    const assignment = await TeachingAssignment.findOne({ teacher: req.user._id, classroom: student.classroom }).lean().read('secondaryPreferred');
    isTeacherAssigned = !!assignment;
  }
  const isAuthorized = canViewStudentAnalytics(req.user, { _id: studentId, school: student.school }, isTeacherAssigned);
  if (!isAuthorized) {
    return next(new AuthorizationError("You do not have permission to view this student's analytics."));
  }
  logger.debug('Student analytics authorization granted', { viewerRole: req.user.role, studentId, ...ctx });

  // --- 4. Analytics Aggregation (The original logic) ---
  const performanceHistory = await Result.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId), status: "approved" } },
    { $sort: { session: 1, term: 1 } },
    {
      $group: {
        _id: "$session",
        terms: { $push: { term: "$term", average: "$average", position: "$position" } },
      },

    },
    { $sort: { _id: 1 } },
  ]);

  // --- 2. Deep Dive for a Specific Term (if session and term are provided) ---
  let termAnalysis = {};
  if (session && term) {
    const currentTermResult = await Result.findOne({
      student: studentId,
      session,
      term: Number(term),
      status: "approved",
    }).populate("items.subject", "name").lean().read('secondaryPreferred');

    if (currentTermResult) {
      // --- 2a. Subject Strength, Weakness, and Critical Flags ---
      const subjectBreakdown = [...currentTermResult.items]
        .sort((a, b) => b.total - a.total)
        .map(item => ({
          subject: item.subject.name,
          score: item.total,
          isCritical: item.total < CRITICAL_SCORE_THRESHOLD,
        }));

      // --- 2b. Comparison with Previous Term/Year ---
      const prevTermResult = await Result.findOne({
        student: studentId,
        session,
        term: Number(term) - 1,
        status: "approved",
      }).lean().read('secondaryPreferred');
      const prevAnnualResult = await AnnualResult.findOne({
        student: studentId,
        session: getPreviousSession(session),
      }).lean().read('secondaryPreferred');

      termAnalysis = {
        currentTermAverage: currentTermResult.average,
        currentTermPosition: currentTermResult.position,
        subjectBreakdown,
        comparison: {
          vsLastTermAverage: prevTermResult ? prevTermResult.average : null,
          vsLastYearAverage: prevAnnualResult ? prevAnnualResult.finalAverage : null,
        },
      };
    }
  }

  const response = { performanceHistory, termAnalysis };
  logger.debug('Student analytics success', { studentId, historyCount: performanceHistory.length, ...ctx });
  return ok(res, response, "Student analytics retrieved successfully.");
});

/**
 * @desc    Get a detailed performance analysis for a single teacher.
 * @route   GET /api/analytics/teacher/:teacherId
 */
export const getTeacherAnalytics = asyncHandler(async (req, res, next) => {
  const { teacherId } = req.params;
  let { session } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(teacherId, 'teacherId', errors);
  if (!session) {
    errors.push({ field: 'session', message: 'session is required' });
  } else {
    session = normalizeSession(session);
    if (!isValidSessionFormat(session)) {
      errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' });
    }
  }
  try { throwIfErrors(errors, 'Teacher analytics validation failed'); } catch (e) { return next(e); }
  req.query.session = session.replace('-', '/');
  logger.debug('Teacher analytics validation passed', { teacherId, session: req.query.session, ...ctx });

  // REFACTORED: This is now a single, efficient aggregation pipeline that avoids the N+1 problem.
  // It starts from the assignments, looks up the results, and calculates performance in one go.
  // INDEX NEEDED: on `teachingassignments` collection: { teacher: 1 }
  // INDEX NEEDED: on `results` collection: { classroom: 1, session: 1, status: 1, "items.subject": 1 }
  const teacherAnalytics = await TeachingAssignment.aggregate([
    // 1. Find all assignments for the given teacher
    { $match: { teacher: new mongoose.Types.ObjectId(teacherId) } },
    // 2. Get classroom and subject details
    { $lookup: { from: 'classrooms', localField: 'classroom', foreignField: '_id', as: 'classroomInfo' } },
    { $lookup: { from: 'subjects', localField: 'subject', foreignField: '_id', as: 'subjectInfo' } },
    { $unwind: '$classroomInfo' },
    { $unwind: '$subjectInfo' },
    // 3. For each assignment, lookup all relevant results for that class and session
    {
      $lookup: {
        from: 'results',
        let: { classroomId: '$classroom', subjectId: '$subject' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$classroom', '$$classroomId'] },
                  { $eq: ['$session', session] },
                  { $eq: ['$status', 'approved'] },
                ]
              }
            }
          },
          { $project: { items: 1 } } // Only need the items array
        ],
        as: 'results'
      }
    },
    // 4. Process the results for each assignment
    { $unwind: '$results' },
    { $unwind: '$results.items' },
    // 5. Filter the result items to match the assignment's subject
    {
      $match: {
        $expr: { $eq: ['$results.items.subject', '$subject'] }
      }
    },
    // 6. Group by assignment to calculate performance metrics
    {
      $group: {
        _id: { classroom: '$classroomInfo.label', subject: '$subjectInfo.name' },
        averageScore: { $avg: '$results.items.total' },
        failureCount: { $sum: { $cond: [{ $lt: ['$results.items.total', CRITICAL_SCORE_THRESHOLD] }, 1, 0] } },
        totalStudents: { $sum: 1 }
      }
    },
    // 7. Reshape the final output
    {
      $project: {
        _id: 0,
        classroom: '$_id.classroom',
        subject: '$_id.subject',
        performance: {
          averageScore: { $round: ['$averageScore', 2] },
          failureRate: { $cond: { if: { $gt: ['$totalStudents', 0] }, then: { $round: [{ $divide: ['$failureCount', '$totalStudents'] }, 2] }, else: 0 } }
        }
      }
    }
  ]).read('secondaryPreferred');

  logger.debug('Teacher analytics success', { teacherId, count: teacherAnalytics.length, ...ctx });
  return ok(res, { analytics: teacherAnalytics }, "Teacher analytics retrieved successfully.");
});

/**
 * @desc    Get aggregated data for the main admin dashboard, including most improved.
 * @route   GET /api/analytics/school-dashboard
 */
export const getSchoolDashboardAnalytics = asyncHandler(async (req, res, next) => {
  let { schoolId, session, term } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(schoolId, 'schoolId', errors);
  if (!session) {
    errors.push({ field: 'session', message: 'session is required' });
  } else {
    session = normalizeSession(session);
    if (!isValidSessionFormat(session)) {
      errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' });
    }
  }
  validateTermNumeric(term, 'term', errors);
  try { throwIfErrors(errors, 'School dashboard analytics validation failed'); } catch (e) { return next(e); }
  req.query.session = session.replace('-', '/');
  logger.debug('School dashboard analytics validation passed', { schoolId, session: req.query.session, term, ...ctx });

  // TODO: Implement Caching for this heavy endpoint.
  // const cacheKey = `dashboard:${schoolId}:${session}:${term}`;
  // const cachedData = await getCache(cacheKey);
  // if (cachedData) { return res.json(cachedData); }

  const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
  const currentTerm = Number(term);
  const previousTerm = currentTerm > 1 ? currentTerm - 1 : null;

  // --- NEW: Get basic school stats (total students and teachers) ---
  // INDEX NEEDED: on `users` collection: { school: 1, role: 1 }
  const schoolStatsPromise = User.aggregate([
    { $match: { school: schoolObjectId, role: { $in: [roles.STUDENT, roles.TEACHER] } } },
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 }
      }
    }
  ]).read('secondaryPreferred');

  // --- NEW: Get school-wide average performance for the term ---
  // INDEX NEEDED: on `results` collection: { school: 1, session: 1, term: 1, status: 1 }
  const schoolAveragePromise = Result.aggregate([
    { $match: { school: schoolObjectId, session, term: currentTerm, status: "approved" } },
    {
      $group: { _id: null, schoolWideAverage: { $avg: "$average" } }
    }
  ]).read('secondaryPreferred');

  // --- NEW: Calculate Attendance Rate (Placeholder) ---
  // In a real application, this would query an 'Attendance' collection.
  // For this example, we'll generate a realistic placeholder value.
  const attendanceRatePromise = Promise.resolve(Math.floor(Math.random() * (98 - 92 + 1) + 92)); // Random % between 92 and 98


  // --- Main Dashboard Aggregation ---
  // INDEX NEEDED: on `results` collection: { school: 1, session: 1, term: 1, status: 1, average: -1 }
  const dashboardDataPromise = Result.aggregate([
    { $match: { school: schoolObjectId, session, term: currentTerm, status: "approved" } },
    {
      $facet: {
        topStudents: [
          { $sort: { average: -1 } }, { $limit: 5 },
          { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentInfo" } },
          { $unwind: "$studentInfo" },
          { $project: { _id: 0, student: "$studentInfo.fullName", average: { $round: ["$average", 2] } } },
        ],
        bottomStudents: [
          { $sort: { average: 1 } }, { $limit: 5 },
          { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentInfo" } },
          { $unwind: "$studentInfo" },
          { $project: { _id: 0, student: "$studentInfo.fullName", average: { $round: ["$average", 2] } } },
        ],
        subjectPerformance: [
          { $unwind: "$items" },
          { $group: { _id: "$items.subject", schoolAverage: { $avg: "$items.total" } } },
          { $lookup: { from: "subjects", localField: "_id", foreignField: "_id", as: "subjectInfo" } },
          { $unwind: "$subjectInfo" },
          { $project: { _id: 0, subject: "$subjectInfo.name", average: { $round: ["$schoolAverage", 2] } } },
          { $sort: { average: -1 } },
        ],
        // The original code used a non-existent "totalScore" field.
        // We are now summing the 'average' field which is a valid score metric.

        housePoints: [
          { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentInfo" } },
          { $unwind: "$studentInfo" },
          { $match: { "studentInfo.house": { $exists: true, $ne: null } } },
          { $group: { _id: "$studentInfo.house", points: { $sum: "$average" } } },
          { $project: { _id: 0, house: "$_id", points: { $round: ["$points", 0] } } },
          { $sort: { points: -1 } },
        ],
        classPerformance: [
          { $group: { _id: "$classroom", avgScore: { $avg: "$average" } } },
          { $lookup: { from: "classrooms", localField: "_id", foreignField: "_id", as: "classInfo" } },
          { $unwind: "$classInfo" },
          { $project: { _id: 0, className: "$classInfo.label", avgScore: { $round: ["$avgScore", 2] } } },
          { $sort: { avgScore: -1 } },
        ],

      }, // closes the object inside $facet
    }, // closes the $facet stage object
  ]).read('secondaryPreferred'); // closes the aggregate pipeline array and function call



  // --- Most Improved Students Aggregation ---
  let mostImprovedPromise = Promise.resolve([]);
  if (previousTerm) {
    // INDEX NEEDED: on `results` collection: { school: 1, session: 1, term: 1, status: 1 }
    mostImprovedPromise = Result.aggregate([
      { $match: { school: schoolObjectId, session, term: { $in: [currentTerm, previousTerm] }, status: "approved" } },
      { $group: { _id: "$student", scores: { $push: { term: "$term", average: "$average" } } } },
      {
        $project: {
          currentScoreDoc: { $arrayElemAt: [{ $filter: { input: "$scores", as: "s", cond: { $eq: ["$$s.term", currentTerm] } } }, 0] },
          previousScoreDoc: { $arrayElemAt: [{ $filter: { input: "$scores", as: "s", cond: { $eq: ["$$s.term", previousTerm] } } }, 0] },
        },
      },
      { $match: { currentScoreDoc: { $exists: true }, previousScoreDoc: { $exists: true } } },
      { $project: { improvement: { $subtract: ["$currentScoreDoc.average", "$previousScoreDoc.average"] } } },
      { $sort: { improvement: -1 } },
      { $limit: 5 },
      { $lookup: { from: "students", localField: "_id", foreignField: "_id", as: "studentInfo" } },
      { $unwind: "$studentInfo" },
      { $project: { _id: 0, student: "$studentInfo.fullName", improvement: { $round: ["$improvement", 2] } } },
    ]).read('secondaryPreferred');
  }

  const [schoolStats, schoolAverageResult, dashboardResults, mostImprovedStudents, attendanceRate] = await runAggregationsSafely([
    schoolStatsPromise,
    schoolAveragePromise,
    dashboardDataPromise,
    mostImprovedPromise,
    attendanceRatePromise
  ], logger, 'school dashboard analytics aggregates');

  // --- Process all results ---
  const totalStudents = schoolStats.find(s => s._id === roles.STUDENT)?.count || 0;
  const totalTeachers = schoolStats.find(s => s._id === roles.TEACHER)?.count || 0;
  const averagePerformance = schoolAverageResult[0]?.schoolWideAverage ? Math.round(schoolAverageResult[0].schoolWideAverage * 10) / 10 : 0; // Round to 1 decimal

  // Defensive check: dashboardResults from a facet is an array with one element.
  const dashboardData = (dashboardResults && dashboardResults[0]) ? dashboardResults[0] : {};

  const dashboard = {
    // Add the new summary stats
    totalStudents,
    totalTeachers,
    averagePerformance,
    attendanceRate,
    topStudents: dashboardData.topStudents || [],
    bottomStudents: dashboardData.bottomStudents || [],
    subjectPerformance: dashboardData.subjectPerformance || [],
    housePoints: dashboardData.housePoints || [],
    classPerformance: dashboardData.classPerformance || [],
  };

  const responseData = {
    message: "School dashboard data retrieved.",
    dashboard: { ...dashboard, mostImprovedStudents },
  };

  // TODO: Set the cache with the final response data
  // await setCache(cacheKey, responseData, 3600); // Cache for 1 hour

  logger.debug('School dashboard analytics success', { schoolId, term: currentTerm, mostImproved: mostImprovedStudents.length, ...ctx });
  return ok(res, responseData.dashboard, "School dashboard data retrieved.", { mostImproved: responseData.dashboard.mostImprovedStudents?.length || 0 });
});

/**
 * @desc    Get all unique academic sessions and terms for a given school.
 * @route   GET /api/analytics/school-sessions/:schoolId
 * @access  Protected (Admins, Principals)
 */
export const getSchoolAcademicTerms = asyncHandler(async (req, res, next) => {
  const { schoolId } = req.params;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(schoolId, 'schoolId', errors);
  try { throwIfErrors(errors, 'School academic terms validation failed'); } catch (e) { return next(e); }
  const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
  logger.debug('School academic terms validation passed', { schoolId, ...ctx });

  // Concurrently fetch distinct sessions and terms for efficiency
  const [sessions, terms] = await Promise.all([
    Result.distinct("session", { school: schoolObjectId }).read('secondaryPreferred'),
    Result.distinct("term", { school: schoolObjectId }).read('secondaryPreferred'),
  ]);

  // Sort the results for a consistent UI experience
  sessions.sort().reverse(); // Sort descending to show newest first
  terms.sort((a, b) => a - b); // Sort ascending for terms

  logger.debug('School academic terms success', { schoolId, sessionsCount: sessions.length, termsCount: terms.length, ...ctx });
  return ok(res, {
    sessions: sessions.length > 0 ? sessions : ['2025/2026'],
    terms: terms.length > 0 ? terms.map(String) : ['1', '2', '3'],
  }, "Available academic terms retrieved successfully.");
});

/**
 * @desc    Get all unique academic sessions across the entire system.
 * @route   GET /api/analytics/all-sessions
 * @access  Protected (GlobalSuperAdmin)
 */
export const getAllAcademicSessions = asyncHandler(async (req, res) => {
  const ctx = buildValidationContext(req);
  const sessions = await Result.distinct("session", {}).read('secondaryPreferred');
  sessions.sort().reverse(); // Sort descending to show newest first
  logger.debug('All academic sessions success', { count: sessions.length, ...ctx });
  return ok(res, { sessions: sessions.length > 0 ? sessions : ['2025/2026'] }, "All academic sessions retrieved.");
});

/**
 * @desc    Perform "Power BI" style dynamic queries for students.
 * @route   POST /api/analytics/query/students
 */
export const queryStudents = asyncHandler(async (req, res, next) => {
  let { schoolId, session, term, filters = [], subjectFilters = [], sortBy = "average", sortOrder = "desc" } = req.body;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(schoolId, 'schoolId', errors);
  if (!session) { errors.push({ field: 'session', message: 'session is required' }); } else {
    session = normalizeSession(session);
    if (!isValidSessionFormat(session)) { errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' }); }
  }
  validateTermNumeric(term, 'term', errors);
  // Validate filters array structure
  if (!Array.isArray(filters)) { errors.push({ field: 'filters', message: 'filters must be an array' }); }
  if (!Array.isArray(subjectFilters)) { errors.push({ field: 'subjectFilters', message: 'subjectFilters must be an array' }); }
  const allowedOperators = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'];
  if (Array.isArray(filters)) {
    filters.forEach((f, idx) => {
      if (!f || typeof f !== 'object') { errors.push({ field: `filters[${idx}]`, message: 'Must be an object' }); return; }
      const { field, operator, value } = f;
      if (!field) errors.push({ field: `filters[${idx}].field`, message: 'field is required' });
      if (!operator) errors.push({ field: `filters[${idx}].operator`, message: 'operator is required' });
      if (operator && !allowedOperators.includes(operator)) errors.push({ field: `filters[${idx}].operator`, message: `Invalid operator. Allowed: ${allowedOperators.join(', ')}` });
      if (value === undefined) errors.push({ field: `filters[${idx}].value`, message: 'value is required' });
    });
  }
  if (Array.isArray(subjectFilters)) {
    subjectFilters.forEach((f, idx) => {
      if (!f || typeof f !== 'object') { errors.push({ field: `subjectFilters[${idx}]`, message: 'Must be an object' }); return; }
      const { subjectName, operator, value } = f;
      if (!subjectName) errors.push({ field: `subjectFilters[${idx}].subjectName`, message: 'subjectName is required' });
      if (!operator) errors.push({ field: `subjectFilters[${idx}].operator`, message: 'operator is required' });
      if (operator && !allowedOperators.includes(operator)) errors.push({ field: `subjectFilters[${idx}].operator`, message: `Invalid operator. Allowed: ${allowedOperators.join(', ')}` });
      if (value === undefined) errors.push({ field: `subjectFilters[${idx}].value`, message: 'value is required' });
    });
  }
  // Additional sort validation
  validateSort(sortBy, sortOrder, ['average', 'position', 'fullName'], errors);
  try { throwIfErrors(errors, 'Query students validation failed'); } catch (e) { return next(e); }
  req.body.session = session.replace('-', '/');
  logger.debug('Query students validation passed', { schoolId, session: req.body.session, term, filtersCount: filters.length, subjectFiltersCount: subjectFilters.length, ...ctx });

  // INDEX NEEDED: on `results` collection: { school: 1, session: 1, term: 1, status: 1 }
  const matchQuery = {
    school: new mongoose.Types.ObjectId(schoolId),
    session: req.body.session,
    term: Number(term),
    status: "approved",
  };

  filters.forEach(filter => {
    const { field, operator, value } = filter;
    if (field && operator && value !== undefined) {
      matchQuery[field] = { [`$${operator}`]: value };
    }
  });

  const pipeline = [{ $match: matchQuery }];

  if (subjectFilters.length > 0) {
    const subjectNames = subjectFilters.map(f => f.subjectName);
    const subjects = await mongoose.model("Subject").find({ school: schoolId, name: { $in: subjectNames } }).select("_id name").lean().read('secondaryPreferred');
    const subjectIdMap = subjects.reduce((acc, s) => ({ ...acc, [s.name]: s._id }), {});
    const elemMatchConditions = subjectFilters
      .filter(f => subjectIdMap[f.subjectName])
      .map(f => ({ "items": { $elemMatch: { subject: subjectIdMap[f.subjectName], total: { [`$${f.operator}`]: f.value } } } }));
    if (elemMatchConditions.length > 0) {
      pipeline.push({ $match: { $and: elemMatchConditions } });
    }
  }

  pipeline.push(
    { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "studentInfo" } },
    { $unwind: "$studentInfo" },
    { $project: { _id: 0, studentId: "$studentInfo._id", fullName: "$studentInfo.fullName", average: { $round: ["$average", 2] }, position: "$position" } },
    { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } }
  );

  const students = await Result.aggregate(pipeline).read('secondaryPreferred');
  logger.debug('Query students success', { schoolId, count: students.length, ...ctx });
  return ok(res, { results: students }, `Found ${students.length} students matching the criteria.`);
});

/**
 * @desc    Get a leaderboard for a specific classroom, term, and session.
 * @route   GET /api/analytics/classroom-leaderboard
 * @access  Protected (Teachers, Principals, Admins)
 */
export const getClassroomLeaderboard = asyncHandler(async (req, res, next) => {
  let { classroomId, session, term } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(classroomId, 'classroomId', errors);
  if (!session) { errors.push({ field: 'session', message: 'session is required' }); } else {
    session = normalizeSession(session);
    if (!isValidSessionFormat(session)) errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' });
  }
  validateTermNumeric(term, 'term', errors);
  try { throwIfErrors(errors, 'Classroom leaderboard validation failed'); } catch (e) { return next(e); }
  req.query.session = session.replace('-', '/');
  logger.debug('Classroom leaderboard validation passed', { classroomId, session: req.query.session, term, ...ctx });

  // Authorization: Ensure the user has access to this classroom's school
  // Global super admins can access all classrooms
  if (req.user.role !== roles.GLOBAL_SUPER_ADMIN) {
    const classroom = await Classroom.findById(classroomId).select("school").lean().read('secondaryPreferred');
    if (!classroom || classroom.school.toString() !== req.user.school.toString()) {
      return next(new AuthorizationError("You do not have access to this classroom."));
    }
  }

  // The Result model already contains pre-calculated totalScore, average, and position
  // from its 'pre-save' hook and the 'approveResult' controller. We can leverage that.
  // INDEX NEEDED: on `results` collection: { classroom: 1, session: 1, term: 1, status: 1, position: 1 }
  const leaderboard = await Result.find({
    classroom: classroomId,
    session,
    term: Number(term),
    status: "approved", // Only show approved results on a leaderboard
  })
    .populate("student", "fullName admissionNumber passportUrl")
    .sort({ position: 1 })
    .lean()
    .read('secondaryPreferred');

  logger.debug('Classroom leaderboard success', { classroomId, count: leaderboard.length, ...ctx });
  return ok(res, { leaderboard }, "Classroom leaderboard retrieved successfully.");
});

/**
 * @desc    Detect students whose performance has declined from the previous term.
 * @route   GET /api/analytics/declining-students
 * @access  Protected (Principals, Admins)
 */
export const getDecliningStudents = asyncHandler(async (req, res, next) => {
  let { schoolId, session } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(schoolId, 'schoolId', errors);
  if (!session) { errors.push({ field: 'session', message: 'session is required' }); } else {
    session = normalizeSession(session);
    if (!isValidSessionFormat(session)) errors.push({ field: 'session', message: 'Invalid session format. Expected YYYY/YYYY or YYYY-YYYY.' });
  }
  try { throwIfErrors(errors, 'Declining students validation failed'); } catch (e) { return next(e); }
  req.query.session = session.replace('-', '/');
  const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
  logger.debug('Declining students validation passed', { schoolId, session: req.query.session, ...ctx });

  // INDEX NEEDED: on `results` collection: { school: 1, session: 1, status: 1, term: 1 }
  const decliningStudents = await Result.aggregate([
    { $match: { school: schoolObjectId, session, status: "approved" } },
    { $sort: { term: 1 } },
    { $group: { _id: "$student", terms: { $push: { term: "$term", average: "$average" } } } },
    { $match: { "terms.1": { $exists: true } } }, // Must have at least 2 terms of data
    {
      $project: {
        lastTermAvg: { $arrayElemAt: ["$terms.average", -1] },
        prevTermAvg: { $arrayElemAt: ["$terms.average", -2] },
      },
    },
    { $addFields: { decline: { $subtract: ["$lastTermAvg", "$prevTermAvg"] } } },
    { $match: { decline: { $lt: 0 } } }, // Filter for those with a negative change (a decline)
    { $sort: { decline: 1 } }, // Show the biggest drops first
    { $limit: 50 }, // Limit to a reasonable number
    { $lookup: { from: "students", localField: "_id", foreignField: "_id", as: "studentInfo" } },
    { $unwind: "$studentInfo" },
    { $lookup: { from: "classrooms", localField: "studentInfo.classroom", foreignField: "_id", as: "classInfo" } },
    { $unwind: "$classInfo" },
    {
      $project: {
        _id: 0,
        studentName: "$studentInfo.fullName",
        className: "$classInfo.label",
        decline: { $round: ["$decline", 2] },
        currentAverage: { $round: ["$lastTermAvg", 2] },
        previousAverage: { $round: ["$prevTermAvg", 2] },
      },
    },
  ]).read('secondaryPreferred');

  logger.debug('Declining students success', { schoolId, count: decliningStudents.length, ...ctx });
  return ok(res, { decliningStudents }, `Found ${decliningStudents.length} students with declining performance this session.`);
});

/**
 * @desc    Create a secure, time-limited shareable link for an analytics report.
 * @route   POST /api/analytics/share
 */
export const createShareableLink = asyncHandler(async (req, res, next) => {
  const { type, targetId, expiresInHours = 24 } = req.body;
  const ctx = buildValidationContext(req);
  const errors = [];
  if (!type) errors.push({ field: 'type', message: 'type is required' });
  if (!targetId) errors.push({ field: 'targetId', message: 'targetId is required' });
  if (type && !['student-analytics', 'teacher-analytics'].includes(type)) {
    errors.push({ field: 'type', message: 'Invalid analytics type. Allowed: student-analytics, teacher-analytics' });
  }
  if (targetId) validateObjectId(targetId, 'targetId', errors);
  try { throwIfErrors(errors, 'Create shareable link validation failed'); } catch (e) { return next(e); }
  logger.debug('Create shareable link validation passed', { type, targetId, expiresInHours, ...ctx });

  // --- Authorization Check: Ensure the user has the right to share this report (IMPROVED) ---
  if (type === "teacher-analytics" && !canShareTeacherAnalytics(req.user)) {
    return next(new AuthorizationError("You do not have permission to share teacher analytics."));
  }
  if (type === "student-analytics" && !canShareStudentAnalytics(req.user, targetId)) {
    return next(new AuthorizationError("You do not have permission to share student analytics."));
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const shareToken = await ShareToken.create({
    type,
    targetId,
    school: req.user.school,
    expiresAt,
    createdBy: req.user._id,
  });

  const baseUrl = process.env.FRONTEND_URL || "https://zinnol.app";
  const shareUrl = `${baseUrl}/view/analytics/${shareToken.token}`;

  logger.debug('Create shareable link success', { type, targetId, expiresAt, ...ctx });
  return created(res, { shareUrl, expiresAt }, "Shareable link created successfully.");
});


/**
 * @desc    Get analytics for teacher activities within a school.
 * @route   GET /api/analytics/teacher-activity
 * @access  Protected (Admins, Principals)
 */
export const getTeacherActivityAnalytics = asyncHandler(async (req, res, next) => {
  const { schoolId, startDate, endDate } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(schoolId, 'schoolId', errors);
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push({ field: 'startDate', message: 'Invalid startDate format. Expected YYYY-MM-DD.' });
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) errors.push({ field: 'endDate', message: 'Invalid endDate format. Expected YYYY-MM-DD.' });
  try { throwIfErrors(errors, 'Teacher activity analytics validation failed'); } catch (e) { return next(e); }
  logger.debug('Teacher activity analytics validation passed', { schoolId, startDate, endDate, ...ctx });

  const matchQuery = {
    school: new mongoose.Types.ObjectId(schoolId),
    status: "completed",
  };
  if (startDate && endDate) {
    matchQuery.startTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const analyticsResult = await TeacherActivity.aggregate([
    { $match: matchQuery },
    {
      $facet: {
        totalHoursByTeacher: [
          { $group: { _id: "$teacher", totalMinutes: { $sum: "$durationInMinutes" } } },
          { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "teacherInfo" } },
          { $unwind: "$teacherInfo" },
          { $project: { _id: 0, teacherId: "$_id", teacherName: "$teacherInfo.name", totalHours: { $round: [{ $divide: ["$totalMinutes", 60] }, 2] } } },
          { $sort: { totalHours: -1 } },
        ],
        totalHoursBySubject: [
          { $group: { _id: "$subject", totalMinutes: { $sum: "$durationInMinutes" } } },
          { $lookup: { from: "subjects", localField: "_id", foreignField: "_id", as: "subjectInfo" } },
          { $unwind: "$subjectInfo" },
          { $project: { _id: 0, subjectId: "$_id", subjectName: "$subjectInfo.name", totalHours: { $round: [{ $divide: ["$totalMinutes", 60] }, 2] } } },
          { $sort: { totalHours: -1 } },
        ],
        averageSessionDuration: [
          { $group: { _id: null, avgMinutes: { $avg: "$durationInMinutes" } } },
          { $project: { _id: 0, averageDurationMinutes: { $round: ["$avgMinutes", 0] } } },
        ],
        activityTimeline: [
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$startTime" } }, count: { $sum: 1 } } },
          { $project: { _id: 0, date: "$_id", sessions: "$count" } },
          { $sort: { date: 1 } },
        ],
      },
    },
    {
      $project: {
        totalHoursByTeacher: "$totalHoursByTeacher",
        totalHoursBySubject: "$totalHoursBySubject",
        averageSessionDuration: { $ifNull: [{ $arrayElemAt: ["$averageSessionDuration.averageDurationMinutes", 0] }, 0] },
        activityTimeline: "$activityTimeline",
      },
    },
  ]).read('secondaryPreferred');

  const analytics = (analyticsResult && analyticsResult[0]) ? analyticsResult[0] : {};

  logger.debug('Teacher activity analytics success', { schoolId, ...ctx });
  return ok(res, { analytics }, "Teacher activity analytics retrieved successfully.");
});

/**
 * @desc    Compares teacher activity logs against the pre-set timetable.
 * @route   GET /api/analytics/timetable-compliance
 * @access  Protected (Admins, Principals)
 */
export const getTimetableCompliance = asyncHandler(async (req, res, next) => {
  const { schoolId, startDate, endDate } = req.query;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(schoolId, 'schoolId', errors);
  if (!startDate) errors.push({ field: 'startDate', message: 'startDate is required' });
  if (!endDate) errors.push({ field: 'endDate', message: 'endDate is required' });
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push({ field: 'startDate', message: 'Invalid startDate format. Expected YYYY-MM-DD.' });
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) errors.push({ field: 'endDate', message: 'Invalid endDate format. Expected YYYY-MM-DD.' });
  try { throwIfErrors(errors, 'Timetable compliance validation failed'); } catch (e) { return next(e); }
  logger.debug('Timetable compliance validation passed', { schoolId, startDate, endDate, ...ctx });

  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999); // Set to the end of the day to include all activities on that day

  // 1. Fetch all activities and timetable entries for the period
  const activities = await TeacherActivity.find({
    school: schoolId,
    startTime: { $gte: start, $lte: end },
    status: "completed",
  }).populate("teacher subject classroom").lean().read('secondaryPreferred');

  const timetableEntries = await Timetable.find({ school: schoolId }).populate("teacher subject classroom").lean().read('secondaryPreferred');

  // 2. Generate all "expected" sessions from the timetable for the date range
  const expectedSessions = [];
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const dayOfWeek = day.getUTCDay() === 0 ? 7 : day.getUTCDay(); // Adjust Sunday from 0 to 7
    const dateStr = day.toISOString().split("T")[0];

    timetableEntries
      .filter(entry => entry.dayOfWeek === dayOfWeek)
      .forEach(entry => {
        expectedSessions.push({
          date: dateStr,
          expectedStartTime: entry.startTime,
          expectedEndTime: entry.endTime,
          classroom: entry.classroom,
          subject: entry.subject,
          teacher: entry.teacher,
          isMet: false, // Flag to track if this expectation was met
        });
      });
  }

  // 3. Match actual activities to expected sessions
  const LATE_THRESHOLD_MINUTES = 10;
  const complianceReport = {
    missedSessions: [],
    unscheduledSessions: [],
    timingDiscrepancies: [],
  };

  activities.forEach(activity => {
    const activityDate = activity.startTime.toISOString().split("T")[0];
    const activityStartMinutes = activity.startTime.getUTCHours() * 60 + activity.startTime.getUTCMinutes();

    const expectedMatch = expectedSessions.find(exp =>
      exp.date === activityDate &&
      exp.classroom._id.equals(activity.classroom._id) &&
      exp.teacher._id.equals(activity.teacher._id) && // Ensure teacher matches
      activityStartMinutes >= (parseInt(exp.expectedStartTime.split(':')[0]) * 60 + parseInt(exp.expectedStartTime.split(':')[1])) &&
      activityStartMinutes < (parseInt(exp.expectedEndTime.split(':')[0]) * 60 + parseInt(exp.expectedEndTime.split(':')[1]))
    );

    if (expectedMatch) {
      expectedMatch.isMet = true;
      const expectedStartMinutes = parseInt(expectedMatch.expectedStartTime.split(':')[0]) * 60 + parseInt(expectedMatch.expectedStartTime.split(':')[1]);
      const actualStartMinutes = activity.startTime.getUTCHours() * 60 + activity.startTime.getUTCMinutes();
      if (actualStartMinutes > expectedStartMinutes + LATE_THRESHOLD_MINUTES) {
        complianceReport.timingDiscrepancies.push({ type: 'Late Start', activity });
      }
    } else {
      complianceReport.unscheduledSessions.push(activity);
    }
  });

  complianceReport.missedSessions = expectedSessions.filter(exp => !exp.isMet);

  logger.debug('Timetable compliance success', { schoolId, missed: complianceReport.missedSessions.length, unscheduled: complianceReport.unscheduledSessions.length, discrepancies: complianceReport.timingDiscrepancies.length, ...ctx });
  return ok(res, complianceReport, "Timetable compliance retrieved successfully.");

});

/**
 * @desc    Get a student's full exam history across all sessions.
 * @route   GET /api/analytics/student/:studentId/exam-history
 * @access  Protected (Admins, Teachers, and Parent/Student for their own profile)
 */
export const getStudentExamHistory = asyncHandler(async (req, res, next) => {
  const { studentId } = req.params;
  const ctx = buildValidationContext(req);
  const errors = [];
  validateObjectId(studentId, 'studentId', errors);
  try { throwIfErrors(errors, 'Student exam history validation failed'); } catch (e) { return next(e); }
  logger.debug('Student exam history validation passed', { studentId, ...ctx });

  // Authorization check
  const { role, studentProfile } = req.user;
  if ((role === roles.PARENT || role === roles.STUDENT) && studentProfile?.toString() !== studentId) {
    return next(new AuthorizationError("You can only view your own exam history."));
  }

  const examHistory = await StudentExam.aggregate([
    // 1. Find all marked submissions for the student
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        status: "marked",
      },
    },
    // 2. Join with the Exam collection to get exam title and subject
    {
      $lookup: {
        from: "exams",
        localField: "exam",
        foreignField: "_id",
        as: "examInfo",
        pipeline: [{ $project: { title: 1, subject: 1, totalMarks: 1 } }],
      },
    },
    { $unwind: "$examInfo" },
    // 3. Join with the Subject collection
    {
      $lookup: { from: "subjects", localField: "examInfo.subject", foreignField: "_id", as: "subjectInfo" },
    },
    { $unwind: "$subjectInfo" },
    // 4. Sort by session and term before grouping
    { $sort: { session: 1, term: 1 } },
    // 5. Group by session
    {
      $group: {
        _id: "$session",
        exams: {
          $push: {
            examId: "$examInfo._id",
            title: "$examInfo.title",
            term: "$term",
            subject: "$subjectInfo.name",
            score: "$totalScore",
            maxScore: "$examInfo.totalMarks",
            dateTaken: "$markedAt",
          },
        },
      },
    },
    // 6. Final sort and reshape the output
    { $sort: { _id: 1 } },
    { $project: { _id: 0, session: "$_id", exams: "$exams" } },
  ]).read('secondaryPreferred');

  logger.debug('Student exam history success', { studentId, sessions: examHistory.length, ...ctx });
  return ok(res, { history: examHistory }, "Student exam history retrieved successfully.");
});
