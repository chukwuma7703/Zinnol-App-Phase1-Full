import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import User from "../models/userModel.js";
import CalendarEvent from "../models/calendarEventModel.js";
import { closeSocket } from "../config/socket.js";
import { roles } from "../config/roles.js";

// Mock the notification delivery to prevent actual external calls
jest.unstable_mockModule("../services/notificationService.js", () => ({
  __esModule: true,
  sendAuthNotificationToUser: jest.fn().mockResolvedValue({ pushed: true }),
}));

// Mock background schedulers to prevent them from running during tests
jest.unstable_mockModule("../utils/notificationScheduler.js", () => ({
  __esModule: true,
  startNotificationScheduler: jest.fn(),
}));
jest.unstable_mockModule("../services/weatherUpdater.js", () => ({
  __esModule: true,
  scheduleWeatherUpdates: jest.fn(),
}));

// Dynamically import app AFTER mocks are set up
const { default: app, server } = await import("../server.js");

const School = (await import("../models/School.js")).default;

// Import the mocked function once at the top level
const { sendAuthNotificationToUser } = await import("../services/notificationService.js");

process.env.JWT_SECRET = "test-secret-for-calendar";

let mongoServer;
let principalToken, otherSchoolPrincipalToken;
let school1, school2, user1, user2;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  process.env.MONGO_URI = mongoUri; // Set for the server's connectDB call
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise(resolve => server.close(resolve));
  closeSocket();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await mongoose.connection.db.dropDatabase();

  school1 = await School.create({ name: "Test School 1" });
  school2 = await School.create({ name: "Test School 2" });

  const principalUser1 = await User.create({ name: "Principal 1", email: "p1@test.com", password: "password", role: roles.PRINCIPAL, school: school1._id });
  const principalUser2 = await User.create({ name: "Principal 2", email: "p2@test.com", password: "password", role: roles.PRINCIPAL, school: school2._id });
  user1 = await User.create({ name: "User 1", email: "u1@test.com", password: "password", role: roles.TEACHER, school: school1._id });
  user2 = await User.create({ name: "User 2", email: "u2@test.com", password: "password", role: roles.TEACHER, school: school1._id });

  principalToken = jwt.sign({ id: principalUser1._id, tokenVersion: 0 }, process.env.JWT_SECRET);
  otherSchoolPrincipalToken = jwt.sign({ id: principalUser2._id, tokenVersion: 0 }, process.env.JWT_SECRET);
});

describe("Calendar Controller (Integration)", () => {
  describe("POST /api/calendar", () => {
    it("should create a public event and trigger notifications for staff", async () => {
      const eventData = {
        title: "Public Meeting",
        description: "All staff meeting",
        startDate: new Date(),
        endDate: new Date(),
        isPrivate: false,
      };

      const res = await request(app)
        .post("/api/calendar")
        .set("Authorization", `Bearer ${principalToken}`)
        .send(eventData);

      expect(res.statusCode).toBe(201);
      expect(res.body.event.title).toBe("Public Meeting");
      // 3 staff in school1 (principal, user1, user2) should be notified
      expect(sendAuthNotificationToUser).toHaveBeenCalledTimes(3);
    });

    it("should create a private event and notify only attendees", async () => {
      const eventData = {
        title: "Private Meeting",
        description: "Board meeting",
        startDate: new Date(),
        endDate: new Date(),
        isPrivate: true,
        attendees: [user1._id, user2._id],
      };

      const res = await request(app)
        .post("/api/calendar")
        .set("Authorization", `Bearer ${principalToken}`)
        .send(eventData);

      expect(res.statusCode).toBe(201);
      expect(res.body.event.isPrivate).toBe(true);
      expect(sendAuthNotificationToUser).toHaveBeenCalledTimes(2);
    });
  });

  describe("GET /api/calendar", () => {
    it("should get all events for the user's school", async () => {
      await CalendarEvent.create({ title: "School 1 Event", school: school1._id, createdBy: user1._id, startDate: new Date(), endDate: new Date(), description: "d" });
      await CalendarEvent.create({ title: "School 2 Event", school: school2._id, createdBy: user1._id, startDate: new Date(), endDate: new Date(), description: "d" });

      const res = await request(app)
        .get(`/api/calendar`) // Corrected: Route should not have schoolId param
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe("School 1 Event");
    });
  });

  describe("GET /api/calendar/:schoolId/:year", () => {
    it("should get events grouped by month and day for a specific year", async () => {
      await CalendarEvent.create({ title: "Event A", school: school1._id, createdBy: user1._id, startDate: new Date("2024-05-10T10:00:00Z"), endDate: new Date(), description: "d" });
      await CalendarEvent.create({ title: "Event B", school: school1._id, createdBy: user1._id, startDate: new Date("2024-05-20T10:00:00Z"), endDate: new Date(), description: "d" });
      await CalendarEvent.create({ title: "Event C", school: school1._id, createdBy: user1._id, startDate: new Date("2024-06-01T10:00:00Z"), endDate: new Date(), description: "d" });

      const res = await request(app)
        .get(`/api/calendar/${school1._id}/2024`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.year).toBe(2024);
      expect(res.body.events['5']).toBeDefined(); // May
      expect(res.body.events['6']).toBeDefined(); // June
      expect(res.body.events['5']['10']).toHaveLength(1);
      expect(res.body.events['5']['20']).toHaveLength(1);
    });
  });

  describe("PUT /api/calendar/:id", () => {
    it("should update an event successfully", async () => {
      const event = await CalendarEvent.create({ title: "Original Title", school: school1._id, createdBy: user1._id, startDate: new Date(), endDate: new Date(), description: "d" });
      const res = await request(app)
        .put(`/api/calendar/${event._id}`)
        .set("Authorization", `Bearer ${principalToken}`)
        .send({ title: "Updated Title" });

      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe("Updated Title");
    });

    it("should deny updating an event from another school", async () => {
      const event = await CalendarEvent.create({ title: "Original Title", school: school1._id, createdBy: user1._id, startDate: new Date(), endDate: new Date(), description: "d" });
      const res = await request(app)
        .put(`/api/calendar/${event._id}`)
        .set("Authorization", `Bearer ${otherSchoolPrincipalToken}`) // User from school 2
        .send({ title: "Updated Title" });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain("update events in your own school");
    });
  });

  describe("DELETE /api/calendar/:id", () => {
    it("should delete an event successfully", async () => {
      const event = await CalendarEvent.create({ title: "To Be Deleted", school: school1._id, createdBy: user1._id, startDate: new Date(), endDate: new Date(), description: "d" });
      const res = await request(app)
        .delete(`/api/calendar/${event._id}`)
        .set("Authorization", `Bearer ${principalToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Event removed");

      const deletedEvent = await CalendarEvent.findById(event._id);
      expect(deletedEvent).toBeNull();
    });

    it("should deny deleting an event from another school", async () => {
      const event = await CalendarEvent.create({ title: "To Be Deleted", school: school1._id, createdBy: user1._id, startDate: new Date(), endDate: new Date(), description: "d" });
      const res = await request(app)
        .delete(`/api/calendar/${event._id}`)
        .set("Authorization", `Bearer ${otherSchoolPrincipalToken}`); // User from school 2

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain("delete events in your own school");
    });
  });
});
