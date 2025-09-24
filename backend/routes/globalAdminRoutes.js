import express from "express";
import { protect, authorizeGlobalAdmin } from "../middleware/authMiddleware.js";
import {
  getGlobalDashboard,
  getAllSchools,
  getPendingSchools,
  approveSchool,
  rejectSchool,
  activateSchool,
  deactivateSchool,
  getSchoolDetails,
  updateSchoolSettings,
  deleteSchool,
  addStudentToSchool,
  getSystemMetrics,
  getGlobalCalendarEvents,
  createGlobalEvent,
  updateGlobalEvent,
  deleteGlobalEvent,
  getSchoolAnalytics,
  exportSchoolData,
  getSystemLogs,
  updateSystemSettings,
  getGlobalNotifications,
  markNotificationRead,
  sendGlobalNotification,
  getSchoolFeatures,
  updateSchoolFeatures,
  getSchoolUsers,
  updateUserRole,
  deactivateUser,
  getSchoolPerformanceMetrics,
  generateSystemReport,
} from "../controllers/globalAdminController.js";

const router = express.Router();

// Apply global admin protection to all routes
router.use(protect);
router.use(authorizeGlobalAdmin);

// Dashboard and Overview
router.get("/dashboard", getGlobalDashboard);
router.get("/system-metrics", getSystemMetrics);
router.get("/notifications", getGlobalNotifications);
router.put("/notifications/:id/read", markNotificationRead);
router.post("/notifications/send", sendGlobalNotification);

// School Management
router.get("/schools", getAllSchools);
router.get("/schools/pending", getPendingSchools);
router.get("/schools/:id", getSchoolDetails);
router.put("/schools/:id", updateSchoolSettings);
router.delete("/schools/:id", deleteSchool);
router.post("/schools/:id/approve", approveSchool);
router.delete("/schools/:id/reject", rejectSchool);
router.put("/schools/:id/activate", activateSchool);
router.put("/schools/:id/deactivate", deactivateSchool);

// School Features Management
router.get("/schools/:id/features", getSchoolFeatures);
router.put("/schools/:id/features", updateSchoolFeatures);

// School Users Management
router.get("/schools/:id/users", getSchoolUsers);
router.put("/schools/:id/users/:userId/role", updateUserRole);
router.put("/schools/:id/users/:userId/deactivate", deactivateUser);

// Student Management
router.post("/schools/:id/students", addStudentToSchool);

// Analytics and Reporting
router.get("/schools/:id/analytics", getSchoolAnalytics);
router.get("/schools/:id/performance", getSchoolPerformanceMetrics);
router.get("/schools/:id/export", exportSchoolData);
router.post("/reports/generate", generateSystemReport);

// Calendar Management
router.get("/calendar/events", getGlobalCalendarEvents);
router.post("/calendar/events", createGlobalEvent);
router.put("/calendar/events/:id", updateGlobalEvent);
router.delete("/calendar/events/:id", deleteGlobalEvent);

// System Management
router.get("/system/logs", getSystemLogs);
router.put("/system/settings", updateSystemSettings);

export default router;