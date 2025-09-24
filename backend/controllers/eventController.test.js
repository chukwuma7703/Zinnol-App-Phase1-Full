import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import errorHandler from "../middleware/errorMiddleware.js";

// --- Mocks Setup ---

const mockEventInstance = {
  _id: "event123",
  title: "School Fair",
  date: "2024-10-26T00:00:00.000Z",
  school: { toString: () => "school123" },
  createdBy: "user123",
  remove: jest.fn().mockResolvedValue(true),
};

jest.unstable_mockModule("../models/eventModel.js", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue(mockEventInstance),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockEventInstance]),
    }),
    findById: jest.fn().mockResolvedValue(mockEventInstance),
    findByIdAndUpdate: jest.fn().mockResolvedValue({ ...mockEventInstance, title: "Updated School Fair" }),
  },
}));

// --- Dynamic Imports ---

const { default: Event } = await import("../models/eventModel.js");
const eventController = await import("./eventController.js");

// --- Test Application Setup ---

const app = express();
app.use(express.json());

// Mock middleware to inject req.user for authenticated routes
const mockAuth = (user) => (req, res, next) => {
  req.user = user;
  next();
};

const mockUser = { _id: "user123", school: { toString: () => "school123" } };
const mockUserOtherSchool = { _id: "user456", school: { toString: () => "school456" } };

// Setup routes with mock authentication
app.post("/api/events", mockAuth(mockUser), eventController.createEvent);
app.get("/api/events", mockAuth(mockUser), eventController.getEvents);
app.put("/api/events/:id", mockAuth(mockUser), eventController.updateEvent);
app.delete("/api/events/:id", mockAuth(mockUser), eventController.deleteEvent);

// Setup a separate route for testing authorization failure
const authFailApp = express();
authFailApp.use(express.json());
authFailApp.put("/api/events/:id", mockAuth(mockUserOtherSchool), eventController.updateEvent);
authFailApp.delete("/api/events/:id", mockAuth(mockUserOtherSchool), eventController.deleteEvent);
authFailApp.use(errorHandler);
const authFailRequest = supertest(authFailApp);

app.use(errorHandler);
const request = supertest(app);

describe("Event Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/events (createEvent)", () => {
    it("should create a new event successfully", async () => {
      const newEventData = { title: "School Fair", date: "2024-10-26" };
      const res = await request.post("/api/events").send(newEventData);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("School Fair");
      expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({
        ...newEventData,
        school: mockUser.school,
        createdBy: mockUser._id,
      }));
    });

    it("should return 400 if required fields are missing", async () => {
      const res = await request.post("/api/events").send({ date: "2024-10-26" }); // Missing title

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Please add all fields");
    });

    it("should return 400 for invalid event data during creation", async () => {
      Event.create.mockResolvedValueOnce(null);
      const res = await request.post("/api/events").send({ title: "Bad Event", date: "2024-10-27" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid event data");
    });
  });

  describe("GET /api/events (getEvents)", () => {
    it("should retrieve all events for the user's school", async () => {
      const res = await request.get("/api/events");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].title).toBe("School Fair");
      expect(Event.find).toHaveBeenCalledWith({ school: mockUser.school });
    });
  });

  describe("PUT /api/events/:id (updateEvent)", () => {
    it("should update an event successfully", async () => {
      const res = await request.put("/api/events/event123").send({ title: "Updated School Fair" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated School Fair");
      expect(Event.findById).toHaveBeenCalledWith("event123");
      expect(Event.findByIdAndUpdate).toHaveBeenCalledWith("event123", { title: "Updated School Fair" }, { new: true });
    });

    it("should return 404 if event is not found", async () => {
      Event.findById.mockResolvedValueOnce(null);
      const res = await request.put("/api/events/notfound").send({ title: "Update" });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Event not found");
    });

    it("should return 401 if user tries to update an event from another school", async () => {
      const res = await authFailRequest.put("/api/events/event123").send({ title: "Update" });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Not authorized to update this event");
    });
  });

  describe("DELETE /api/events/:id (deleteEvent)", () => {
    it("should delete an event successfully", async () => {
      const res = await request.delete("/api/events/event123");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("event123");
      expect(Event.findById).toHaveBeenCalledWith("event123");
      expect(mockEventInstance.remove).toHaveBeenCalled();
    });

    it("should return 404 if event to delete is not found", async () => {
      Event.findById.mockResolvedValueOnce(null);
      const res = await request.delete("/api/events/notfound");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Event not found");
    });

    it("should return 401 if user tries to delete an event from another school", async () => {
      const res = await authFailRequest.delete("/api/events/event123");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Not authorized to delete this event");
    });
  });
});

