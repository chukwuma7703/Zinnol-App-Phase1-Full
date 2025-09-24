import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import errorHandler from "../middleware/errorMiddleware.js";

// --- Mocks Setup ---

const mockNotificationInstance = {
  _id: "notif123",
  user: "user123",
  title: "Test Notification",
  isRead: false,
  save: jest.fn().mockReturnThis(),
};

jest.unstable_mockModule("../models/Notification.js", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([mockNotificationInstance]),
    }),
    findById: jest.fn().mockResolvedValue(mockNotificationInstance),
  },
}));

// --- Dynamic Imports ---
let notificationController;
let Notification;

const mockUser = { _id: "user123" };
const mockOtherUser = { _id: "user456" };

const mockAuth = (user) => (req, res, next) => {
  req.user = user;
  next();
};

beforeAll(async () => {
  const notificationModule = await import("./notificationController.js");
  const notificationModel = await import("../models/Notification.js");
  notificationController = notificationModule;
  Notification = notificationModel.default;

  // --- Test App Setup ---
  const app = express();
  app.use(express.json());

  // Setup routes
  app.get("/api/notifications/me", mockAuth(mockUser), notificationController.getMyNotifications);
  app.patch("/api/notifications/:id/read", mockAuth(mockUser), notificationController.markNotificationRead);

  app.use(errorHandler);
  global.request = supertest(app);
});

describe("Notification Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock return values
    Notification.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([mockNotificationInstance]),
    });
    Notification.findById.mockResolvedValue(mockNotificationInstance);
  });

  describe("GET /api/notifications/me", () => {
    it("should get notifications for the authenticated user", async () => {
      const res = await global.request.get("/api/notifications/me");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].title).toBe("Test Notification");
      expect(Notification.find).toHaveBeenCalledWith({ user: mockUser._id });
    });
  });

  describe("PATCH /api/notifications/:id/read", () => {
    it("should mark a notification as read successfully", async () => {
      const res = await global.request.patch("/api/notifications/notif123/read");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Marked read");
      expect(Notification.findById).toHaveBeenCalledWith("notif123");
      expect(mockNotificationInstance.save).toHaveBeenCalled();
    });

    it("should return 404 if notification not found", async () => {
      Notification.findById.mockResolvedValueOnce(null);
      const res = await global.request.patch("/api/notifications/notfound/read");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Notification not found");
    });

    it("should return 403 if user tries to mark another user's notification as read", async () => {
      const authFailApp = express();
      authFailApp.use(express.json());
      authFailApp.patch("/api/notifications/:id/read", mockAuth(mockOtherUser), notificationController.markNotificationRead);
      authFailApp.use(errorHandler);
      const authFailRequest = supertest(authFailApp);

      const res = await authFailRequest.patch("/api/notifications/notif123/read");

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Not allowed");
    });
  });
});

