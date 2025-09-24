import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import mongoose from "mongoose";
import errorHandler from "../middleware/errorMiddleware.js";

// --- Mocks Setup ---

const mockCalendarEventInstance = {
  _id: "60d0fe4f5311236168a109d0",
  title: "Annual Inter-house Sports",
  school: "60d0fe4f5311236168a109cb",
  startDate: new Date("2024-10-26T10:00:00Z"),
  // Add a save function for update operations
  save: jest.fn().mockResolvedValue(this),
};

const mockUserInstance = {
  _id: "user123",
  name: "Test User",
  school: "school123",
};

// Mock models
jest.unstable_mockModule("../models/calendarEventModel.js", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue(mockCalendarEventInstance),
    find: jest.fn().mockResolvedValue([mockCalendarEventInstance]),
    findById: jest.fn().mockResolvedValue(mockCalendarEventInstance),
    findByIdAndUpdate: jest.fn().mockResolvedValue({ ...mockCalendarEventInstance, title: "Updated Event" }),
    findByIdAndDelete: jest.fn().mockResolvedValue(mockCalendarEventInstance),
  },
}));

jest.unstable_mockModule("../models/userModel.js", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockResolvedValue([mockUserInstance]),
  },
}));

jest.unstable_mockModule("../models/Notification.js", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({ _id: "notif123", title: "New Event" }),
  },
}));

// Mock the centralized notification service
jest.unstable_mockModule("../services/notificationService.js", () => ({
  __esModule: true,
  sendAuthNotificationToUser: jest.fn().mockResolvedValue({ pushed: true }),
}));

// Mock mongoose ObjectId validation
jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockImplementation(id => /^[0-9a-fA-F]{24}$/.test(id));

// --- Dynamic Imports ---
const calendarController = await import("./calendarController.js");
const { default: CalendarEvent } = await import("../models/calendarEventModel.js");
const { default: User } = await import("../models/userModel.js");
const { default: Notification } = await import("../models/Notification.js");
const { sendAuthNotificationToUser } = await import("../services/notificationService.js");
const { roles } = await import("../config/roles.js");

// --- Test App Setup ---
const app = express();
app.use(express.json());

const mockAuth = (user) => (req, res, next) => {
  req.user = user;
  next();
};

const mockAdminUser = { _id: "60d0fe4f5311236168a109c9", school: "60d0fe4f5311236168a109cb" }; // Use a valid ObjectId string

// Setup routes
app.get("/api/calendar", mockAuth(mockAdminUser), calendarController.getEvents);
app.get("/api/calendar/:schoolId/:year", mockAuth(mockAdminUser), calendarController.getEventsByYear);
app.post("/api/calendar", mockAuth(mockAdminUser), calendarController.createEvent);
app.put("/api/calendar/60d0fe4f5311236168a109d0", mockAuth(mockAdminUser), calendarController.updateEvent);
app.delete("/api/calendar/60d0fe4f5311236168a109d0", mockAuth(mockAdminUser), calendarController.deleteEvent);

app.use(errorHandler);
const request = supertest(app);

describe("Calendar Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/calendar/:schoolId/:year", () => {
    it("should get events for a year and group them by month and day", async () => {
      const events = [
        { startDate: new Date("2024-03-15T10:00:00Z") },
        { startDate: new Date("2024-03-15T12:00:00Z") },
        { startDate: new Date("2024-04-01T09:00:00Z") },
      ];
      CalendarEvent.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(events) });

      const res = await request.get(`/api/calendar/${mockAdminUser.school}/2024`);

      expect(res.status).toBe(200);
      expect(res.body.year).toBe(2024);
      expect(res.body.events['3']).toBeDefined(); // March
      expect(res.body.events['4']).toBeDefined(); // April
      expect(res.body.events['3']['15']).toHaveLength(2);
      expect(res.body.events['4']['1']).toHaveLength(1);
    });
  });

  describe("POST /api/calendar", () => {
    const eventData = { title: "New Event", description: "A test event", startDate: new Date(), endDate: new Date(), isPrivate: false };

    it("should create a public event and notify relevant staff", async () => {
      const mockStaff = [{ _id: "admin1" }, { _id: "teacher1" }];
      User.find.mockResolvedValue(mockStaff);

      const res = await request.post("/api/calendar").send(eventData);

      expect(res.status).toBe(201);
      expect(CalendarEvent.create).toHaveBeenCalled();
      expect(User.find).toHaveBeenCalledWith({
        school: mockAdminUser.school,
        role: { $in: [roles.TEACHER, roles.PRINCIPAL, roles.SUPER_ADMIN, roles.MAIN_SUPER_ADMIN] },
      });
      expect(sendAuthNotificationToUser).toHaveBeenCalledTimes(mockStaff.length);
    });

    it("should create a private event and notify only specified attendees", async () => {
      const privateEventData = { ...eventData, isPrivate: true, attendees: ["user1", "user2"] };
      const mockAttendees = [{ _id: "user1" }, { _id: "user2" }];
      User.find.mockResolvedValue(mockAttendees);

      const res = await request.post("/api/calendar").send(privateEventData);

      expect(res.status).toBe(201);
      expect(User.find).toHaveBeenCalledWith({ _id: { $in: privateEventData.attendees } });
    });
  });
});
