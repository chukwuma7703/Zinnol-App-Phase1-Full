import request from "supertest";
import mongoose from "mongoose";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TestDatabase, TestAuth } from "../testUtils.js";
import app, { server } from "../../server.js"; // Import both app and the http server
import Notification from "../../models/Notification.js";
import { roles } from "../../config/roles.js";
import { closeSocket } from "../../config/socket.js";

// Mock the messaging service from firebaseAdmin to prevent actual push notifications
jest.unstable_mockModule('../../config/firebaseAdmin.js', () => ({
    __esModule: true,
    messaging: {
        send: jest.fn().mockResolvedValue('mock-message-id'),
    },
}));

// Dynamically import the mocked module to get a handle on the mock function
const { messaging } = await import('../../config/firebaseAdmin.js');

describe("Notification Routes API (/api/notifications)", () => {
    let adminUser, studentUser, adminToken, studentToken;

    beforeAll(async () => {
        // 1. Set up the in-memory database
        await TestDatabase.setup();
    });

    afterAll(async () => {
        // 2. Tear down the database and close the server to allow Jest to exit
        await TestDatabase.teardown();
        await new Promise(resolve => server.close(resolve));
        closeSocket();
    });

    beforeEach(async () => {
        // 3. Clear data and create fresh test users and data before each test
        await TestDatabase.clearDatabase();
        const testUsers = await TestAuth.createTestUsers();
        adminUser = testUsers.globalAdmin;
        studentUser = testUsers.student;
        adminToken = TestAuth.generateAuthToken(adminUser);
        studentToken = TestAuth.generateAuthToken(studentUser);

        // Create some notifications for the student
        await Notification.create([
            { user: studentUser._id, title: "Welcome!", message: "Welcome to Zinnol." },
            { user: studentUser._id, title: "Reminder", message: "Your exam is tomorrow.", isRead: true },
            { user: adminUser._id, title: "Admin Info", message: "System update scheduled." },
        ]);
    });

    describe("GET /api/notifications/me", () => {
        it("should get all notifications for the authenticated user", async () => {
            // 4. Make an authenticated request using supertest
            const res = await request(app)
                .get("/api/notifications/me")
                .set("Authorization", `Bearer ${studentToken}`);

            // 5. Assert the response
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2); // The student should only see their 2 notifications
            expect(res.body[0].title).toBe("Welcome!");
        });

        it("should return 401 if not authenticated", async () => {
            const res = await request(app).get("/api/notifications/me");
            expect(res.status).toBe(401);
        });
    });

    describe("PATCH /api/notifications/:id/read", () => {
        it("should allow a user to mark their own notification as read", async () => {
            const unreadNotif = await Notification.findOne({ user: studentUser._id, isRead: false });

            const res = await request(app)
                .patch(`/api/notifications/${unreadNotif._id}/read`)
                .set("Authorization", `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Marked read");

            const updatedNotif = await Notification.findById(unreadNotif._id);
            expect(updatedNotif.isRead).toBe(true);
        });

        it("should return 403 if a user tries to mark another user's notification as read", async () => {
            const adminNotif = await Notification.findOne({ user: adminUser._id });

            const res = await request(app)
                .patch(`/api/notifications/${adminNotif._id}/read`)
                .set("Authorization", `Bearer ${studentToken}`); // Student tries to mark admin's notification

            expect(res.status).toBe(403);
            expect(res.body.message).toBe("Not allowed");
        });
    });

    describe("POST /api/notifications/send", () => {
        it("should allow an admin to send a push notification", async () => {
            const pushData = {
                token: "device-fcm-token",
                title: "Admin Broadcast",
                body: "This is an important message from the admin.",
            };

            const res = await request(app)
                .post("/api/notifications/send")
                .set("Authorization", `Bearer ${adminToken}`)
                .send(pushData);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(messaging.send).toHaveBeenCalledWith({
                notification: { title: pushData.title, body: pushData.body },
                token: pushData.token,
            });
        });
    });
});