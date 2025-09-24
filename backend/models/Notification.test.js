import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Notification from "./Notification.js";
import { roles } from "../config/roles.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-notification' },
        replSet: { count: 1 },
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    // Clear all collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

describe("Notification Model", () => {
    // Mock ObjectIds for testing
    const mockUserId = new mongoose.Types.ObjectId();
    const mockEventId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create a notification with all required fields", async () => {
            const notificationData = {
                message: "Test notification message"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.message).toBe("Test notification message");
            expect(savedNotification.type).toBe("general");
            expect(savedNotification.status).toBe("unsent");
            expect(savedNotification.isRead).toBe(false);
        });

        it("should create a notification with all optional fields", async () => {
            const notifyAt = new Date("2024-12-31T10:00:00Z");
            const notificationData = {
                user: mockUserId,
                role: "TEACHER",
                event: mockEventId,
                title: "Event Reminder",
                message: "Don't forget the parent-teacher meeting",
                type: "event",
                data: new Map([
                    ["eventId", "12345"],
                    ["meetingType", "parent-teacher"]
                ]),
                status: "scheduled",
                isRead: true,
                notifyAt: notifyAt
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.user.toString()).toBe(mockUserId.toString());
            expect(savedNotification.role).toBe("TEACHER");
            expect(savedNotification.event.toString()).toBe(mockEventId.toString());
            expect(savedNotification.title).toBe("Event Reminder");
            expect(savedNotification.message).toBe("Don't forget the parent-teacher meeting");
            expect(savedNotification.type).toBe("event");
            expect(savedNotification.data.get("eventId")).toBe("12345");
            expect(savedNotification.data.get("meetingType")).toBe("parent-teacher");
            expect(savedNotification.status).toBe("scheduled");
            expect(savedNotification.isRead).toBe(true);
            expect(savedNotification.notifyAt).toEqual(notifyAt);
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create notification without message", async () => {
            const notificationData = {
                type: "auth"
            };

            const notification = new Notification(notificationData);
            await expect(notification.save()).rejects.toThrow(/message.*required/i);
        });
    });

    describe("Field Validation", () => {
        it("should accept valid role values", async () => {
            const validRoles = Object.values(roles);

            for (const role of validRoles) {
                const notificationData = {
                    message: `Test message for ${role}`,
                    role: role
                };

                const notification = new Notification(notificationData);
                const savedNotification = await notification.save();
                expect(savedNotification.role).toBe(role);
            }
        });

        it("should reject invalid role values", async () => {
            const notificationData = {
                message: "Test message",
                role: "invalid_role"
            };

            const notification = new Notification(notificationData);
            await expect(notification.save()).rejects.toThrow();
        });

        it("should accept valid status values", async () => {
            const validStatuses = ["unsent", "scheduled", "sent", "failed"];

            for (const status of validStatuses) {
                const notificationData = {
                    message: `Test message for ${status}`,
                    status: status
                };

                const notification = new Notification(notificationData);
                const savedNotification = await notification.save();
                expect(savedNotification.status).toBe(status);
            }
        });

        it("should reject invalid status values", async () => {
            const notificationData = {
                message: "Test message",
                status: "invalid_status"
            };

            const notification = new Notification(notificationData);
            await expect(notification.save()).rejects.toThrow();
        });

        it("should handle Map data type correctly", async () => {
            const notificationData = {
                message: "Test message",
                data: new Map([
                    ["key1", "value1"],
                    ["key2", "value2"]
                ])
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.data instanceof Map).toBe(true);
            expect(savedNotification.data.get("key1")).toBe("value1");
            expect(savedNotification.data.get("key2")).toBe("value2");
        });

        it("should handle empty Map data", async () => {
            const notificationData = {
                message: "Test message",
                data: new Map()
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.data instanceof Map).toBe(true);
            expect(savedNotification.data.size).toBe(0);
        });
    });

    describe("Default Values", () => {
        it("should default type to general", async () => {
            const notificationData = {
                message: "Test message"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.type).toBe("general");
        });

        it("should default status to unsent", async () => {
            const notificationData = {
                message: "Test message"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.status).toBe("unsent");
        });

        it("should default isRead to false", async () => {
            const notificationData = {
                message: "Test message"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.isRead).toBe(false);
        });
    });

    describe("Optional Fields", () => {
        it("should allow notification without user", async () => {
            const notificationData = {
                message: "Broadcast message",
                role: "STUDENT"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.user).toBeUndefined();
            expect(savedNotification.role).toBe("STUDENT");
        });

        it("should allow notification without role", async () => {
            const notificationData = {
                message: "Personal message",
                user: mockUserId
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.user.toString()).toBe(mockUserId.toString());
            expect(savedNotification.role).toBeUndefined();
        });

        it("should allow notification without title", async () => {
            const notificationData = {
                message: "Message without title"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.title).toBeUndefined();
        });

        it("should allow notification without event", async () => {
            const notificationData = {
                message: "General notification"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.event).toBeUndefined();
        });

        it("should allow notification without notifyAt", async () => {
            const notificationData = {
                message: "Immediate notification"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.notifyAt).toBeUndefined();
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const notificationData = {
                message: "Timestamp test"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.createdAt).toBeInstanceOf(Date);
            expect(savedNotification.updatedAt).toBeInstanceOf(Date);
            expect(savedNotification.updatedAt.getTime()).toBeGreaterThanOrEqual(savedNotification.createdAt.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const notificationData = {
                message: "Update test"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();
            const originalUpdatedAt = savedNotification.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedNotification.isRead = true;
            await savedNotification.save();

            expect(savedNotification.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Status Transitions", () => {
        it("should allow status transitions from unsent to scheduled", async () => {
            const notificationData = {
                message: "Status transition test",
                status: "unsent"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            savedNotification.status = "scheduled";
            await savedNotification.save();

            expect(savedNotification.status).toBe("scheduled");
        });

        it("should allow status transitions to sent with sentAt", async () => {
            const notificationData = {
                message: "Sent notification test"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            const sentTime = new Date();
            savedNotification.status = "sent";
            savedNotification.sentAt = sentTime;
            await savedNotification.save();

            expect(savedNotification.status).toBe("sent");
            expect(savedNotification.sentAt).toEqual(sentTime);
        });

        it("should allow status transitions to failed with deliveryAttemptedAt", async () => {
            const notificationData = {
                message: "Failed notification test"
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            const attemptTime = new Date();
            savedNotification.status = "failed";
            savedNotification.deliveryAttemptedAt = attemptTime;
            await savedNotification.save();

            expect(savedNotification.status).toBe("failed");
            expect(savedNotification.deliveryAttemptedAt).toEqual(attemptTime);
        });
    });

    describe("Data Integrity", () => {
        it("should handle large messages", async () => {
            const longMessage = "A".repeat(1000);
            const notificationData = {
                message: longMessage
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.message).toBe(longMessage);
        });

        it("should handle special characters in message", async () => {
            const specialMessage = "Message with special chars: éñüñ 中文 🚀";
            const notificationData = {
                message: specialMessage
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.message).toBe(specialMessage);
        });

        it("should handle complex data Map", async () => {
            const complexData = new Map([
                ["userId", "12345"],
                ["eventId", "67890"],
                ["action", "reminder"],
                ["priority", "high"],
                ["url", "https://app.example.com/events/67890"]
            ]);

            const notificationData = {
                message: "Complex data test",
                data: complexData
            };

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            expect(savedNotification.data.get("userId")).toBe("12345");
            expect(savedNotification.data.get("eventId")).toBe("67890");
            expect(savedNotification.data.get("action")).toBe("reminder");
            expect(savedNotification.data.get("priority")).toBe("high");
            expect(savedNotification.data.get("url")).toBe("https://app.example.com/events/67890");
        });
    });
});
