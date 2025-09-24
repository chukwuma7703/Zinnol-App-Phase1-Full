import asyncHandler from "express-async-handler";
import School from "../models/School.js";
import User from "../models/userModel.js";
import Student from "../models/Student.js";
import Teachers from "../models/Teachers.js";
import Result from "../models/Result.js";
import Notification from "../models/Notification.js";
import { roles } from "../config/roles.js";
import AppError from "../utils/AppError.js";
import { ok, created } from "../utils/ApiResponse.js";
import mongoose from "mongoose";

/**
 * @desc    Get global dashboard overview
 * @route   GET /api/global-admin/dashboard
 * @access  Protected (Global Super Admin)
 */
export const getGlobalDashboard = asyncHandler(async (req, res) => {
  // Get total counts
  const totalSchools = await School.countDocuments({ isActive: true });
  const totalStudents = await User.countDocuments({ role: roles.STUDENT });
  const totalTeachers = await User.countDocuments({ role: roles.TEACHER });
  const totalUsers = await User.countDocuments();
  const activeAdmins = await User.countDocuments({
    role: { $in: [roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL] },
    isActive: true
  });
  const pendingApprovals = await School.countDocuments({ isApproved: false });

  // Get growth metrics (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const newSchoolsThisMonth = await School.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
    isActive: true
  });
  const newStudentsThisMonth = await User.countDocuments({
    role: roles.STUDENT,
    createdAt: { $gte: thirtyDaysAgo }
  });
  const newTeachersThisMonth = await User.countDocuments({
    role: roles.TEACHER,
    createdAt: { $gte: thirtyDaysAgo }
  });

  // Calculate growth percentages
  const schoolGrowth = totalSchools > 0 ? ((newSchoolsThisMonth / totalSchools) * 100).toFixed(1) : 0;
  const studentGrowth = totalStudents > 0 ? ((newStudentsThisMonth / totalStudents) * 100).toFixed(1) : 0;
  const teacherGrowth = totalTeachers > 0 ? ((newTeachersThisMonth / totalTeachers) * 100).toFixed(1) : 0;

  // Get system health metrics
  const systemHealth = {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    activeConnections: req.app.locals.activeConnections || 0,
  };

  // Get recent activities
  const recentSchools = await School.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name createdAt');

  const dashboardData = {
    totalSchools,
    totalStudents,
    totalTeachers,
    totalUsers,
    activeAdmins,
    pendingApprovals,
    growth: {
      schools: parseFloat(schoolGrowth),
      students: parseFloat(studentGrowth),
      teachers: parseFloat(teacherGrowth),
    },
    systemHealth,
    recentActivities: recentSchools,
  };

  ok(res, { data: dashboardData });
});

/**
 * @desc    Get all schools with detailed information
 * @route   GET /api/global-admin/schools
 * @access  Protected (Global Super Admin)
 */
export const getAllSchools = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, region } = req.query;

  // Build query
  let query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    query.isActive = status === 'active';
  }

  if (region) {
    query.region = region;
  }

  const schools = await School.find(query)
    .populate('mainSuperAdmins', 'name email')
    .populate('students', 'name email')
    .populate('teachers', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await School.countDocuments(query);

  // Add additional metrics for each school
  const schoolsWithMetrics = await Promise.all(
    schools.map(async (school) => {
      const studentCount = await User.countDocuments({
        school: school._id,
        role: roles.STUDENT
      });
      const teacherCount = await User.countDocuments({
        school: school._id,
        role: roles.TEACHER
      });
      const recentResults = await Result.countDocuments({
        school: school._id,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      return {
        ...school.toObject(),
        metrics: {
          studentCount,
          teacherCount,
          recentResults,
        },
      };
    })
  );

  ok(res, {
    schools: schoolsWithMetrics,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get pending school approvals
 * @route   GET /api/global-admin/schools/pending
 * @access  Protected (Global Super Admin)
 */
export const getPendingSchools = asyncHandler(async (req, res) => {
  const pendingSchools = await School.find({ isApproved: false })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  ok(res, { schools: pendingSchools });
});

/**
 * @desc    Approve a pending school
 * @route   POST /api/global-admin/schools/:id/approve
 * @access  Protected (Global Super Admin)
 */
export const approveSchool = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }
  const school = await School.findById(req.params.id);

  if (!school) {
    throw new AppError("School not found", 404);
  }

  school.isApproved = true;
  school.isActive = true;
  school.approvedAt = new Date();
  school.approvedBy = req.user._id;

  await school.save();

  // Send notification to school admin
  if (school.createdBy) {
    await Notification.create({
      user: school.createdBy,
      title: "School Approved",
      message: `Your school "${school.name}" has been approved and is now active.`,
      type: "approval",
    });
  }

  ok(res, { school }, "School approved successfully");
});

/**
 * @desc    Reject a pending school
 * @route   DELETE /api/global-admin/schools/:id/reject
 * @access  Protected (Global Super Admin)
 */
export const rejectSchool = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }
  const school = await School.findById(req.params.id);

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // Send notification to school admin
  if (school.createdBy) {
    await Notification.create({
      user: school.createdBy,
      title: "School Application Rejected",
      message: `Your school application for "${school.name}" has been rejected. Reason: ${reason || 'Not specified'}`,
      type: "rejection",
    });
  }

  await School.findByIdAndDelete(req.params.id);

  ok(res, null, "School application rejected");
});

/**
 * @desc    Activate a school
 * @route   PUT /api/global-admin/schools/:id/activate
 * @access  Protected (Global Super Admin)
 */
export const activateSchool = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }
  const school = await School.findByIdAndUpdate(
    req.params.id,
    { isActive: true, updatedBy: req.user._id },
    { new: true }
  );

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // Activate all users in the school
  await User.updateMany(
    { school: school._id },
    { isActive: true }
  );

  ok(res, { school }, "School activated successfully");
});

/**
 * @desc    Deactivate a school
 * @route   PUT /api/global-admin/schools/:id/deactivate
 * @access  Protected (Global Super Admin)
 */
export const deactivateSchool = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }
  const school = await School.findByIdAndUpdate(
    req.params.id,
    { isActive: false, updatedBy: req.user._id },
    { new: true }
  );

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // Deactivate all users in the school
  await User.updateMany(
    { school: school._id },
    { isActive: false }
  );

  ok(res, { school }, "School deactivated successfully");
});

/**
 * @desc    Get detailed school information
 * @route   GET /api/global-admin/schools/:id
 * @access  Protected (Global Super Admin)
 */
export const getSchoolDetails = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }
  const school = await School.findById(req.params.id)
    .populate('mainSuperAdmins', 'name email role isActive')
    .populate('students', 'name email className isActive')
    .populate('teachers', 'name email subjects isActive');

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // Get additional metrics
  const totalStudents = await User.countDocuments({
    school: school._id,
    role: roles.STUDENT
  });
  const activeStudents = await User.countDocuments({
    school: school._id,
    role: roles.STUDENT,
    isActive: true
  });
  const totalTeachers = await User.countDocuments({
    school: school._id,
    role: roles.TEACHER
  });
  const activeTeachers = await User.countDocuments({
    school: school._id,
    role: roles.TEACHER,
    isActive: true
  });

  // Get recent results
  const recentResults = await Result.find({ school: school._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('student', 'name')
    .populate('subject', 'name');

  const schoolDetails = {
    ...school.toObject(),
    metrics: {
      totalStudents,
      activeStudents,
      totalTeachers,
      activeTeachers,
    },
    recentResults,
  };

  ok(res, { school: schoolDetails });
});

/**
 * @desc    Update school settings
 * @route   PUT /api/global-admin/schools/:id
 * @access  Protected (Global Super Admin)
 */
export const updateSchoolSettings = asyncHandler(async (req, res, next) => {
  const { name, address, phone, numberOfStudents, numberOfTeachers, features } = req.body;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }

  const school = await School.findByIdAndUpdate(
    req.params.id,
    {
      name,
      address,
      phone,
      numberOfStudents,
      numberOfTeachers,
      features,
      updatedBy: req.user._id,
    },
    { new: true, runValidators: true }
  );

  if (!school) {
    throw new AppError("School not found", 404);
  }

  ok(res, { school }, "School updated successfully");
});

/**
 * @desc    Delete a school and all associated data
 * @route   DELETE /api/global-admin/schools/:id
 * @access  Protected (Global Super Admin)
 */
export const deleteSchool = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid school id", 400);
  }
  const school = await School.findById(req.params.id);

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // Delete all associated users
  await User.deleteMany({ school: school._id });

  // Delete all associated results
  await Result.deleteMany({ school: school._id });

  // Delete the school
  await School.findByIdAndDelete(req.params.id);

  ok(res, null, "School and all associated data deleted successfully");
});

/**
 * @desc    Add student to a school
 * @route   POST /api/global-admin/schools/:id/students
 * @access  Protected (Global Super Admin)
 */
export const addStudentToSchool = asyncHandler(async (req, res, next) => {
  const { name, email, password, className } = req.body;
  const schoolId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new AppError("Invalid school id", 400);
  }

  const school = await School.findById(schoolId);
  if (!school) {
    throw new AppError("School not found", 404);
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError("User with this email already exists", 400));
  }

  // Create student
  const student = await User.create({
    name,
    email,
    password,
    className,
    role: roles.STUDENT,
    school: schoolId,
    createdBy: req.user._id,
  });

  // Add student to school's students array
  school.students.push(student._id);
  await school.save();

  ok(res, { student }, "Student added successfully");
});

/**
 * @desc    Get system metrics and health
 * @route   GET /api/global-admin/system-metrics
 * @access  Protected (Global Super Admin)
 */
export const getSystemMetrics = asyncHandler(async (req, res) => {
  const metrics = {
    serverUptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    databaseHealth: "Excellent", // This would be calculated based on actual DB metrics
    apiResponseTime: "120ms", // This would be calculated from actual metrics
    storageUsage: "68%", // This would be calculated from actual storage metrics
    activeConnections: req.app.locals.activeConnections || 0,
    errorRate: "0.02%", // This would be calculated from actual error logs
    systemLoad: process.loadavg(),
  };

  ok(res, { metrics });
});

/**
 * @desc    Get global calendar events
 * @route   GET /api/global-admin/calendar/events
 * @access  Protected (Global Super Admin)
 */
export const getGlobalCalendarEvents = asyncHandler(async (req, res) => {
  // This would integrate with a calendar system
  // For now, returning mock data
  const events = [
    {
      id: 1,
      title: "System Maintenance",
      start: new Date(2024, 2, 15, 10, 0),
      end: new Date(2024, 2, 15, 14, 0),
      type: "maintenance",
      description: "Scheduled system maintenance",
    },
    {
      id: 2,
      title: "New School Onboarding",
      start: new Date(2024, 2, 20, 9, 0),
      end: new Date(2024, 2, 20, 17, 0),
      type: "onboarding",
      description: "Onboarding session for new schools",
    },
  ];

  ok(res, { events });
});

/**
 * @desc    Create global calendar event
 * @route   POST /api/global-admin/calendar/events
 * @access  Protected (Global Super Admin)
 */
export const createGlobalEvent = asyncHandler(async (req, res, next) => {
  const { title, start, end, type, description } = req.body;

  // This would create an event in the calendar system
  const event = {
    id: Date.now(), // In real implementation, this would be generated by the calendar system
    title,
    start: new Date(start),
    end: new Date(end),
    type,
    description,
    createdBy: req.user._id,
  };

  created(res, { event }, "Event created successfully");
});

/**
 * @desc    Update global calendar event
 * @route   PUT /api/global-admin/calendar/events/:id
 * @access  Protected (Global Super Admin)
 */
export const updateGlobalEvent = asyncHandler(async (req, res, next) => {
  const { title, start, end, type, description } = req.body;

  // This would update an event in the calendar system
  const event = {
    id: req.params.id,
    title,
    start: new Date(start),
    end: new Date(end),
    type,
    description,
    updatedBy: req.user._id,
  };

  ok(res, { event }, "Event updated successfully");
});

/**
 * @desc    Delete global calendar event
 * @route   DELETE /api/global-admin/calendar/events/:id
 * @access  Protected (Global Super Admin)
 */
export const deleteGlobalEvent = asyncHandler(async (req, res, next) => {
  // This would delete an event from the calendar system
  ok(res, null, "Event deleted successfully");
});

/**
 * @desc    Get school analytics
 * @route   GET /api/global-admin/schools/:id/analytics
 * @access  Protected (Global Super Admin)
 */
export const getSchoolAnalytics = asyncHandler(async (req, res) => {
  const schoolId = req.params.id;

  // Get student performance analytics
  const studentResults = await Result.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(schoolId) } },
    {
      $group: {
        _id: "$subject",
        averageScore: { $avg: "$score" },
        totalResults: { $sum: 1 },
        passRate: {
          $avg: {
            $cond: [{ $gte: ["$score", 50] }, 1, 0]
          }
        }
      }
    }
  ]);

  // Get enrollment trends
  const enrollmentTrends = await User.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(schoolId), role: roles.STUDENT } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);

  const analytics = {
    studentResults,
    enrollmentTrends,
    totalStudents: await User.countDocuments({ school: schoolId, role: roles.STUDENT }),
    totalTeachers: await User.countDocuments({ school: schoolId, role: roles.TEACHER }),
    totalResults: await Result.countDocuments({ school: schoolId }),
  };

  ok(res, { analytics });
});

/**
 * @desc    Export school data
 * @route   GET /api/global-admin/schools/:id/export
 * @access  Protected (Global Super Admin)
 */
export const exportSchoolData = asyncHandler(async (req, res, next) => {
  const schoolId = req.params.id;
  const { format = 'json' } = req.query;

  const school = await School.findById(schoolId)
    .populate('mainSuperAdmins', 'name email')
    .populate('students', 'name email className')
    .populate('teachers', 'name email subjects');

  if (!school) {
    return next(new AppError("School not found", 404));
  }

  // Get results
  const results = await Result.find({ school: schoolId })
    .populate('student', 'name')
    .populate('subject', 'name');

  const exportData = {
    school: school.toObject(),
    results,
    exportedAt: new Date(),
    exportedBy: req.user._id,
  };

  if (format === 'csv') {
    // Convert to CSV format
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${school.name}-data.csv"`);
    // CSV conversion logic would go here
    res.send('CSV data would be here');
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${school.name}-data.json"`);
    res.json(exportData);
  }
});

/**
 * @desc    Get system logs
 * @route   GET /api/global-admin/system/logs
 * @access  Protected (Global Super Admin)
 */
export const getSystemLogs = asyncHandler(async (req, res) => {
  const { level = 'all', limit = 100, page = 1 } = req.query;

  // This would integrate with your logging system
  // For now, returning mock data
  const logs = [
    {
      timestamp: new Date(),
      level: 'info',
      message: 'User login successful',
      userId: req.user._id,
    },
    {
      timestamp: new Date(Date.now() - 60000),
      level: 'warning',
      message: 'High memory usage detected',
    },
    {
      timestamp: new Date(Date.now() - 120000),
      level: 'error',
      message: 'Database connection timeout',
    },
  ];

  ok(res, { logs });
});

/**
 * @desc    Update system settings
 * @route   PUT /api/global-admin/system/settings
 * @access  Protected (Global Super Admin)
 */
export const updateSystemSettings = asyncHandler(async (req, res) => {
  const { maintenanceMode, maxSchools, maxStudentsPerSchool, features } = req.body;

  // This would update system-wide settings
  // For now, just returning success
  const settings = {
    maintenanceMode,
    maxSchools,
    maxStudentsPerSchool,
    features,
    updatedBy: req.user._id,
    updatedAt: new Date(),
  };

  ok(res, { settings }, "System settings updated successfully");
});

/**
 * @desc    Get global notifications
 * @route   GET /api/global-admin/notifications
 * @access  Protected (Global Super Admin)
 */
export const getGlobalNotifications = asyncHandler(async (req, res, next) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  ok(res, { notifications });
});

/**
 * @desc    Mark notification as read
 * @route   PUT /api/global-admin/notifications/:id/read
 * @access  Protected (Global Super Admin)
 */
export const markNotificationRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    return next(new AppError("Notification not found", 404));
  }

  ok(res, { notification }, "Notification marked as read");
});

/**
 * @desc    Send global notification
 * @route   POST /api/global-admin/notifications/send
 * @access  Protected (Global Super Admin)
 */
export const sendGlobalNotification = asyncHandler(async (req, res, next) => {
  const { title, message, recipients, type = 'info' } = req.body;

  let targetUsers = [];

  if (recipients === 'all') {
    targetUsers = await User.find({ isActive: true }).select('_id');
  } else if (recipients === 'admins') {
    targetUsers = await User.find({
      role: { $in: [roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL] },
      isActive: true
    }).select('_id');
  } else if (Array.isArray(recipients)) {
    targetUsers = recipients.map(id => ({ _id: id }));
  }

  // Create notifications for all target users
  const notifications = targetUsers.map(user => ({
    user: user._id,
    title,
    message,
    type,
    createdBy: req.user._id,
  }));

  await Notification.insertMany(notifications);

  ok(res, { sent: notifications.length }, "Global notification sent successfully");
});

/**
 * @desc    Get school features
 * @route   GET /api/global-admin/schools/:id/features
 * @access  Protected (Global Super Admin)
 */
export const getSchoolFeatures = asyncHandler(async (req, res, next) => {
  const school = await School.findById(req.params.id).select('features');

  if (!school) {
    return next(new AppError("School not found", 404));
  }

  ok(res, { features: school.features || {} });
});

/**
 * @desc    Update school features
 * @route   PUT /api/global-admin/schools/:id/features
 * @access  Protected (Global Super Admin)
 */
export const updateSchoolFeatures = asyncHandler(async (req, res, next) => {
  const { features } = req.body;

  const school = await School.findByIdAndUpdate(
    req.params.id,
    { features, updatedBy: req.user._id },
    { new: true }
  );

  if (!school) {
    return next(new AppError("School not found", 404));
  }

  ok(res, { features: school.features }, "School features updated successfully");
});

/**
 * @desc    Get school users
 * @route   GET /api/global-admin/schools/:id/users
 * @access  Protected (Global Super Admin)
 */
export const getSchoolUsers = asyncHandler(async (req, res, next) => {
  const users = await User.find({ school: req.params.id })
    .select('name email role isActive createdAt lastLogin')
    .sort({ createdAt: -1 });

  ok(res, { users });
});

/**
 * @desc    Update user role
 * @route   PUT /api/global-admin/schools/:id/users/:userId/role
 * @access  Protected (Global Super Admin)
 */
export const updateUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;

  if (!Object.values(roles).includes(role)) {
    return next(new AppError("Invalid role", 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { role, updatedBy: req.user._id },
    { new: true }
  );

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  ok(res, { user }, "User role updated successfully");
});

/**
 * @desc    Deactivate user
 * @route   PUT /api/global-admin/schools/:id/users/:userId/deactivate
 * @access  Protected (Global Super Admin)
 */
export const deactivateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { isActive: false, updatedBy: req.user._id },
    { new: true }
  );

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  ok(res, { user }, "User deactivated successfully");
});

/**
 * @desc    Get school performance metrics
 * @route   GET /api/global-admin/schools/:id/performance
 * @access  Protected (Global Super Admin)
 */
export const getSchoolPerformanceMetrics = asyncHandler(async (req, res) => {
  const schoolId = req.params.id;

  // Get performance metrics
  const metrics = await Result.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(schoolId) } },
    {
      $group: {
        _id: null,
        averageScore: { $avg: "$score" },
        totalResults: { $sum: 1 },
        passRate: {
          $avg: {
            $cond: [{ $gte: ["$score", 50] }, 1, 0]
          }
        },
        excellentRate: {
          $avg: {
            $cond: [{ $gte: ["$score", 80] }, 1, 0]
          }
        }
      }
    }
  ]);

  const performance = metrics[0] || {
    averageScore: 0,
    totalResults: 0,
    passRate: 0,
    excellentRate: 0,
  };

  ok(res, { performance });
});

/**
 * @desc    Generate system report
 * @route   POST /api/global-admin/reports/generate
 * @access  Protected (Global Super Admin)
 */
export const generateSystemReport = asyncHandler(async (req, res) => {
  const { reportType, dateRange, schools } = req.body;

  // This would generate various types of reports
  // For now, returning a mock report
  const report = {
    id: Date.now(),
    type: reportType,
    dateRange,
    schools: schools || 'all',
    generatedAt: new Date(),
    generatedBy: req.user._id,
    status: 'completed',
    downloadUrl: `/api/global-admin/reports/${Date.now()}/download`,
  };

  created(res, { report }, "Report generation started");
});