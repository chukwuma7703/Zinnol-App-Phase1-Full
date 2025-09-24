import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { roles } from "../config/roles.js";
import {
  getGlobalOverviewAnalytics,
  getSystemWideAnalytics,
  getStudentAnalytics,
  getTeacherAnalytics,
  getSchoolDashboardAnalytics,
  queryStudents,
  createShareableLink,
  getTeacherActivityAnalytics,
  getTimetableCompliance,
  getSchoolAcademicTerms,
  getAllAcademicSessions,
  getClassroomLeaderboard,
  getDecliningStudents,
  getStudentExamHistory,
} from "../controllers/analysisController.js";
import { getMainSuperAdminOverview } from "../controllers/mainSuperAdminController.js";

const router = express.Router(); // eslint-disable-line new-cap
/**
 * @route   GET /api/analytics/main-super-admin-overview
 * @desc    Get detailed analytics for the main super admin dashboard.
 * @access  Protected (Main Super Admin)
 */
router.get(
  "/main-super-admin-overview",
  protect,
  authorizeRoles([roles.MAIN_SUPER_ADMIN]),
  getMainSuperAdminOverview
);

const canViewAnalytics = [
  roles.GLOBAL_SUPER_ADMIN,
  roles.MAIN_SUPER_ADMIN,
  roles.SUPER_ADMIN,
  roles.PRINCIPAL,
];

const canViewTeacherAnalytics = [
  roles.GLOBAL_SUPER_ADMIN,
  roles.MAIN_SUPER_ADMIN,
  roles.SUPER_ADMIN,
];

const canViewGlobalAnalytics = [roles.GLOBAL_SUPER_ADMIN];

/**
 * @route   GET /api/analytics/global-overview
 * @desc    Get aggregated data for the global super admin dashboard.
 * @access  Protected (Global Super Admin) or Public in development
 */
router.get(
  "/global-overview",
  process.env.NODE_ENV === 'development' ? getGlobalOverviewAnalytics : [protect, authorizeRoles(canViewGlobalAnalytics), getGlobalOverviewAnalytics]
);

/**
 * @route   GET /api/analytics/system-wide
 * @desc    Get system-wide analytics for the global admin.
 * @access  Protected (Global Super Admin)
 */
router.get(
  "/system-wide",
  protect,
  authorizeRoles(canViewGlobalAnalytics),
  getSystemWideAnalytics
);

/**
 * @route   GET /api/analytics/all-sessions
 * @desc    Get all unique academic sessions across the system.
 * @access  Protected (Global Super Admin)
 */
router.get(
  "/all-sessions",
  protect,
  authorizeRoles(canViewGlobalAnalytics),
  getAllAcademicSessions
);
/**
 * @route   GET /api/analytics/student/:studentId
 * @desc    Get a detailed performance analysis for a single student.
 * @access  Protected (Admins, Principals, Teachers)
 */
router.get(
  "/student/:studentId",
  protect,
  authorizeRoles([...canViewAnalytics, roles.TEACHER, roles.PARENT, roles.STUDENT]),
  getStudentAnalytics
);

/**
 * @route   GET /api/analytics/teacher/:teacherId
 * @desc    Get a detailed performance analysis for a single teacher.
 * @access  Protected (Admins, Principals, Teachers, and Parent/Student for their own)
 */
router.get(
  "/teacher/:teacherId",
  protect,
  authorizeRoles(canViewTeacherAnalytics),
  getTeacherAnalytics
);

/**
 * @route   GET /api/analytics/timetable-compliance
 * @desc    Compares teacher activity logs against the pre-set timetable.
 * @access  Protected (Admins, Principals)
 */
router.get(
  "/timetable-compliance",
  protect,
  authorizeRoles(canViewAnalytics),
  getTimetableCompliance
);

/**
 * @route   GET /api/analytics/school-dashboard
 * @desc    Get aggregated data for the main admin dashboard.
 * @access  Protected (Admins, Principals)
 */
router.get(
  "/school-dashboard",
  protect,
  authorizeRoles(canViewAnalytics),
  getSchoolDashboardAnalytics
);

/**
 * @route   GET /api/analytics/school-sessions/:schoolId
 * @desc    Get all unique academic sessions and terms for a given school.
 * @access  Protected (Admins, Principals)
 */
router.get(
  "/school-sessions/:schoolId",
  protect,
  authorizeRoles(canViewAnalytics),
  getSchoolAcademicTerms
);

/**
 * @route   POST /api/analytics/query/students
 * @desc    Perform advanced, dynamic queries for students based on criteria.
 *          This is the "Power BI" style search endpoint.
 * @access  Protected (Admins, Principals)
 *
 * @example Body:
 * {
 *   "schoolId": "...",
 *   "session": "2023/2024",
 *   "filters": [
 *     { "field": "average", "operator": "gte", "value": 85 },
 *     { "field": "subject.Mathematics", "operator": "lt", "value": 50 }
 *   ],
 *   "sortBy": "average",
 *   "sortOrder": "desc"
 * }
 */
router.post(
  "/query/students",
  protect,
  authorizeRoles(canViewAnalytics),
  queryStudents
);

/**
 * @route   POST /api/analytics/share
 * @desc    Create a secure, time-limited shareable link for an analytics report.
 * @access  Protected (Varies by type of report being shared)
 */
router.post("/share", protect, createShareableLink);

/**
 * @route   GET /api/analytics/teacher-activity
 * @desc    Get analytics dashboard for teacher activities.
 * @access  Protected (Admins, Principals)
 */
router.get(
  "/teacher-activity",
  protect,
  authorizeRoles(canViewAnalytics),
  getTeacherActivityAnalytics

);

/**
 * @route   GET /api/analytics/classroom-leaderboard
 * @desc    Get a leaderboard for a specific classroom, term, and session.
 * @access  Protected (Teachers, Principals, Admins)
 */
router.get(
  "/classroom-leaderboard",
  protect,
  authorizeRoles([...canViewAnalytics, roles.TEACHER]),
  getClassroomLeaderboard
);

/**
 * @route   GET /api/analytics/declining-students
 * @desc    Detect students whose performance has declined from the previous term.
 * @access  Protected (Principals, Admins)
 */
router.get(
  "/declining-students",
  protect,
  authorizeRoles(canViewAnalytics),
  getDecliningStudents
);

/**
 * @route   GET /api/analytics/student/:studentId/exam-history
 * @desc    Get a student's full exam history across all sessions.
 * @access  Protected (Admins, Teachers, and Parent/Student for their own profile)
 */
router.get("/student/:studentId/exam-history", protect, getStudentExamHistory);

export default router;
