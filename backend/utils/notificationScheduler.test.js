import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock dependencies before importing the scheduler
const mockNotificationFind = jest.fn();
jest.unstable_mockModule("../models/Notification.js", () => ({
    __esModule: true,
    default: {
        find: mockNotificationFind,
    },
}));

const mockDeliverNotification = jest.fn();
jest.unstable_mockModule("../services/notificationService.js", () => ({
    __esModule: true,
    deliverNotification: mockDeliverNotification,
}));

const mockCronSchedule = jest.fn();
jest.unstable_mockModule("node-cron", () => ({
    __esModule: true,
    default: {
        schedule: mockCronSchedule,
    },
}));

// Dynamically import the scheduler after mocks are set up
const scheduler = await import("./notificationScheduler.js");

describe("Notification Scheduler", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("runNotificationSchedulerOnce", () => {
        it("should do nothing if no notifications are due", async () => {
            mockNotificationFind.mockReturnValue({
                populate: jest.fn().mockResolvedValue([]), // No due notifications
            });

            const result = await scheduler.runNotificationSchedulerOnce();

            expect(mockNotificationFind).toHaveBeenCalledTimes(1);
            expect(mockDeliverNotification).not.toHaveBeenCalled();
            expect(result.delivered).toBe(0);
        });

        it("should call deliverNotification for each due notification", async () => {
            const dueNotifications = [
                { _id: "notif1", message: "Event A is starting soon." },
                { _id: "notif2", message: "Event B is starting soon." },
            ];
            mockNotificationFind.mockReturnValue({
                populate: jest.fn().mockResolvedValue(dueNotifications),
            });

            const result = await scheduler.runNotificationSchedulerOnce();

            expect(mockDeliverNotification).toHaveBeenCalledTimes(2);
            expect(mockDeliverNotification).toHaveBeenCalledWith(dueNotifications[0]);
            expect(mockDeliverNotification).toHaveBeenCalledWith(dueNotifications[1]);
            expect(result.delivered).toBe(2);
        });

        it("should handle errors during database query and return an error object", async () => {
            const dbError = new Error("Database connection lost");
            mockNotificationFind.mockReturnValue({
                populate: jest.fn().mockRejectedValue(dbError),
            });
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            const result = await scheduler.runNotificationSchedulerOnce();

            expect(mockDeliverNotification).not.toHaveBeenCalled();
            expect(result.delivered).toBe(0);
            expect(result.error).toBe("Database connection lost");
            expect(consoleErrorSpy).toHaveBeenCalledWith("runNotificationSchedulerOnce error:", "Database connection lost");

            consoleErrorSpy.mockRestore();
        });
    });

    describe("startNotificationScheduler", () => {
        it("should schedule a cron job with the default expression", () => {
            scheduler.startNotificationScheduler();
            expect(mockCronSchedule).toHaveBeenCalledWith("*/1 * * * *", expect.any(Function));
        });

        it("should schedule a cron job with the expression from environment variables", () => {
            process.env.NOTIFICATION_CRON = "0 * * * *"; // Every hour
            scheduler.startNotificationScheduler();
            expect(mockCronSchedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function));
            delete process.env.NOTIFICATION_CRON; // Clean up env var
        });

        it("should execute runNotificationSchedulerOnce and log success when the cron job callback is invoked", async () => {
            // Instead of spying, we test the integration by letting the real
            // runNotificationSchedulerOnce execute against our mocked dependencies.
            mockNotificationFind.mockReturnValue({
                populate: jest.fn().mockResolvedValue([{ _id: "notif1" }]), // Simulate one notification found
            });
            const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            scheduler.startNotificationScheduler();

            // Extract and execute the callback passed to cron.schedule
            const cronCallback = mockCronSchedule.mock.calls[0][1];
            await cronCallback();

            // Verify that the inner function's logic was called
            expect(mockNotificationFind).toHaveBeenCalledTimes(1);
            expect(mockDeliverNotification).toHaveBeenCalledWith({ _id: "notif1" });

            // Verify the logging from the cron job callback
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("notificationScheduler running..."));
            expect(consoleLogSpy).toHaveBeenCalledWith("[Scheduler] Successfully delivered 1 notifications.");
            expect(consoleErrorSpy).not.toHaveBeenCalled();

            consoleLogSpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });
    });
});
