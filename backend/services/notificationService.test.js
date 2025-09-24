import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// --- Mock external services and modules ---
const mockSendMail = jest.fn();
jest.unstable_mockModule("nodemailer", () => ({
    createTransport: jest.fn(() => ({
        sendMail: mockSendMail,
    })),
}));

const mockSendMulticast = jest.fn();
jest.unstable_mockModule("../config/firebaseAdmin.js", () => ({
    __esModule: true,
    messaging: {
        sendMulticast: mockSendMulticast,
    },
}));

const mockIoToEmit = jest.fn();
const mockIoTo = jest.fn(() => ({ emit: mockIoToEmit }));
jest.unstable_mockModule("../config/socket.js", () => ({
    __esModule: true,
    getIO: jest.fn(() => ({
        to: mockIoTo,
    })),
}));

const mockNotificationUpdate = jest.fn();
const mockNotificationCreate = jest.fn();
jest.unstable_mockModule("../models/Notification.js", () => ({
    __esModule: true,
    default: {
        findByIdAndUpdate: mockNotificationUpdate,
        create: mockNotificationCreate,
    },
}));

const mockUserFindById = jest.fn();
jest.unstable_mockModule("../models/userModel.js", () => ({
    __esModule: true,
    default: {
        findById: mockUserFindById,
    },
}));

// --- Dynamically import the module to be tested ---
const { deliverNotification, sendAuthNotificationToUser, sendEmail, sendPush } = await import("./notificationService.js");

describe("Notification Service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.SMTP_HOST = "smtp.example.com"; // Ensure host is set for email tests
    });

    describe("deliverNotification", () => {
        const mockUser = { _id: "user123", email: "test@example.com", deviceTokens: ["token1"] };
        const mockNotification = {
            _id: "notif123",
            user: mockUser,
            title: "Test Event",
            message: "This is a test message.",
            event: "event123",
            save: jest.fn(),
        };

        it("should attempt to send via socket, push, and email for a valid notification", async () => {
            await deliverNotification(mockNotification);

            expect(mockIoTo).toHaveBeenCalledWith(`user-${mockUser._id}`);
            expect(mockIoToEmit).toHaveBeenCalledWith("newNotification", mockNotification);
            expect(mockSendMulticast).toHaveBeenCalled();
            expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: mockUser.email }));
            expect(mockNotificationUpdate).toHaveBeenCalledWith(mockNotification._id, {
                $set: { status: "sent", sentAt: expect.any(Date), deliveryAttemptedAt: expect.any(Date) },
            });
        });

        it("should handle notifications without a user by marking them as failed", async () => {
            const noUserNotif = { ...mockNotification, user: null, save: jest.fn() };
            await deliverNotification(noUserNotif);

            expect(noUserNotif.save).toHaveBeenCalled();
            expect(noUserNotif.status).toBe("failed");
            expect(mockIoTo).not.toHaveBeenCalled();
        });

        it("should not send email if user has no email address", async () => {
            const noEmailUser = { ...mockUser, email: null };
            const notifWithNoEmailUser = { ...mockNotification, user: noEmailUser };
            await deliverNotification(notifWithNoEmailUser);
            expect(mockSendMail).not.toHaveBeenCalled();
            expect(mockSendMulticast).toHaveBeenCalled(); // Push should still be sent
        });

        it("should not send push if user has no device tokens", async () => {
            const noTokenUser = { ...mockUser, deviceTokens: [] };
            const notifWithNoTokenUser = { ...mockNotification, user: noTokenUser };
            await deliverNotification(notifWithNoTokenUser);
            expect(mockSendMulticast).not.toHaveBeenCalled();
            expect(mockSendMail).toHaveBeenCalled(); // Email should still be sent
        });

        it("should mark notification as 'failed' on error", async () => {
            mockIoTo.mockImplementation(() => { throw new Error("Socket error"); });
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

            await deliverNotification(mockNotification);

            expect(mockNotificationUpdate).toHaveBeenCalledWith(mockNotification._id, {
                $set: { status: "failed", deliveryAttemptedAt: expect.any(Date) },
            });
            expect(consoleErrorSpy).toHaveBeenCalledWith("deliverNotification error:", "Socket error");
            consoleErrorSpy.mockRestore();
        });
    });

    describe("sendAuthNotificationToUser", () => {
        const mockUserWithTokens = {
            _id: "user123",
            fcmTokens: ["token1", "token2"],
            save: jest.fn(),
        };
        const mockCreatedNotif = { _id: "dbNotif123" };

        beforeEach(() => {
            mockNotificationCreate.mockResolvedValue(mockCreatedNotif);
            mockUserFindById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUserWithTokens) });
            mockSendMulticast.mockResolvedValue({ successCount: 2, failureCount: 0, responses: [{ success: true }, { success: true }] });
        });

        it("should create a DB record, find user, and send a push notification", async () => {
            const result = await sendAuthNotificationToUser("user123", "Test Title", "Test Body");

            expect(mockNotificationCreate).toHaveBeenCalledWith({
                user: "user123",
                title: "Test Title",
                message: "Test Body", // Ensure we check for 'message' field
                type: "auth",
                data: {},
            });
            expect(mockUserFindById).toHaveBeenCalledWith("user123");
            expect(mockSendMulticast).toHaveBeenCalled();
            expect(result.pushed).toBe(true);
            expect(result.successCount).toBe(2);
        });

        it("should return 'no-tokens' if user has no FCM tokens", async () => {
            mockUserFindById.mockReturnValue({ select: jest.fn().mockResolvedValue({ ...mockUserWithTokens, fcmTokens: [] }) });
            const result = await sendAuthNotificationToUser("user123", "Test Title", "Test Body");
            expect(result.pushed).toBe(false);
            expect(result.reason).toBe("no-tokens");
        });

        it("should handle DB creation failure", async () => {
            mockNotificationCreate.mockRejectedValue(new Error("DB Error"));
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
            const result = await sendAuthNotificationToUser("user123", "Test Title", "Test Body");

            expect(result.pushed).toBe(false);
            expect(result.reason).toBe("db-error");
            expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Failed to create notification record:", expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it("should clean up invalid tokens after sending", async () => {
            mockSendMulticast.mockResolvedValue({
                successCount: 1,
                failureCount: 1,
                responses: [
                    { success: true },
                    { success: false, error: { code: "messaging/registration-token-not-registered" } },
                ],
            });

            await sendAuthNotificationToUser("user123", "Test Title", "Test Body");

            expect(mockUserWithTokens.save).toHaveBeenCalled();
            expect(mockUserWithTokens.fcmTokens).toEqual(["token1"]);
        });
    });

    describe("sendEmail helper", () => {
        it("should call sendMail with correct parameters on success", async () => {
            mockSendMail.mockResolvedValue({ messageId: "email-sent-id" });
            const result = await sendEmail("recipient@example.com", "Test Subject", "Test Body");
            expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "recipient@example.com" }));
            expect(result).toHaveProperty("messageId", "email-sent-id");
        });

        it("should handle errors gracefully and return false", async () => {
            mockSendMail.mockRejectedValue(new Error("SMTP Error"));
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
            const result = await sendEmail("recipient@example.com", "Test Subject", "Test Body");
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith("sendEmail error:", "SMTP Error");
            consoleErrorSpy.mockRestore();
        });
    });

    describe("sendPush helper", () => {
        const mockUser = { _id: "user123", deviceTokens: ["token1"] };

        it("should call sendMulticast with correct parameters", async () => {
            await sendPush(mockUser, "Push Title", "Push Body");
            expect(mockSendMulticast).toHaveBeenCalledWith(expect.objectContaining({
                notification: { title: "Push Title", body: "Push Body" },
                tokens: ["token1"],
            }));
        });

        it("should return null and not call sendMulticast if user has no tokens", async () => {
            const noTokenUser = { ...mockUser, deviceTokens: [] };
            const result = await sendPush(noTokenUser, "Title", "Body");
            expect(result).toBeNull();
            expect(mockSendMulticast).not.toHaveBeenCalled();
        });

        it("should handle errors gracefully and return null", async () => {
            mockSendMulticast.mockRejectedValue(new Error("FCM Error"));
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
            const result = await sendPush(mockUser, "Title", "Body");
            expect(result).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith("sendPush error:", "FCM Error");
            consoleErrorSpy.mockRestore();
        });
    });
});
