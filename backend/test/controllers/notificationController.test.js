import { vi, describe, it, expect, beforeEach } from 'vitest';
import Notification from '../../models/Notification.js';
vi.mock('../../config/firebaseAdmin.js', () => ({
    messaging: { send: vi.fn() }
}));
import { messaging } from '../../config/firebaseAdmin.js';
import { getMyNotifications, markNotificationRead, sendPushNotification } from '../../controllers/notificationController.js';

describe('Notification Controller', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        mockReq = { user: { _id: 'userId123' }, params: {}, body: {} };
        mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() };
        mockNext = vi.fn();
        vi.clearAllMocks();
    });

    describe('getMyNotifications', () => {
        it('should return user notifications sorted by notifyAt', async () => {
            const mockNotifications = [
                { _id: '1', user: 'userId123', notifyAt: new Date('2025-01-02'), event: { title: 'Event 1' } },
                { _id: '2', user: 'userId123', notifyAt: new Date('2025-01-01'), event: { title: 'Event 2' } }
            ];

            const populate = vi.fn().mockResolvedValue(mockNotifications);
            const chain = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), populate };
            const findSpy = vi.spyOn(Notification, 'find').mockReturnValue(chain);

            await getMyNotifications(mockReq, mockRes, mockNext);

            expect(findSpy).toHaveBeenCalledWith({ user: 'userId123' });
            expect(mockRes.json).toHaveBeenCalledWith(mockNotifications);
            findSpy.mockRestore();
        });

        it('should handle database errors', async () => {
            const error = new Error('Database connection failed');
            const chain = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), populate: vi.fn().mockRejectedValue(error) };
            const findSpy = vi.spyOn(Notification, 'find').mockReturnValue(chain);

            await getMyNotifications(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
            findSpy.mockRestore();
        });
    });

    describe('markNotificationRead', () => {
        it('should mark notification as read successfully', async () => {
            const mockNotification = {
                _id: 'notifId123',
                user: 'userId123',
                isRead: false,
                save: vi.fn().mockResolvedValue()
            };

            mockReq.params.id = 'notifId123';
            const findByIdSpy = vi.spyOn(Notification, 'findById').mockResolvedValue(mockNotification);

            await markNotificationRead(mockReq, mockRes, mockNext);

            expect(findByIdSpy).toHaveBeenCalledWith('notifId123');
            expect(mockNotification.isRead).toBe(true);
            expect(mockNotification.save).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Marked read' });
            findByIdSpy.mockRestore();
        });

        it('should return 404 for non-existent notification', async () => {
            mockReq.params.id = 'nonexistent';
            const findByIdSpy = vi.spyOn(Notification, 'findById').mockResolvedValue(null);

            await markNotificationRead(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Notification not found' });
            findByIdSpy.mockRestore();
        });

        it('should return 403 for notification belonging to different user', async () => {
            const mockNotification = {
                _id: 'notifId123',
                user: 'differentUserId',
                isRead: false
            };

            mockReq.params.id = 'notifId123';
            const findByIdSpy = vi.spyOn(Notification, 'findById').mockResolvedValue(mockNotification);

            await markNotificationRead(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Not allowed' });
            findByIdSpy.mockRestore();
        });

        it('should handle database errors', async () => {
            const error = new Error('Database connection failed');
            const findByIdSpy = vi.spyOn(Notification, 'findById').mockRejectedValue(error);

            await markNotificationRead(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
            findByIdSpy.mockRestore();
        });
    });

    describe('sendPushNotification', () => {
        it('should send push notification successfully', async () => {
            const mockMessageId = 'messageId123';
            mockReq.body = {
                token: 'deviceToken123',
                title: 'Test Title',
                body: 'Test Body'
            };

            messaging.send.mockResolvedValue(mockMessageId);

            await sendPushNotification(mockReq, mockRes, mockNext);

            expect(messaging.send).toHaveBeenCalledWith({
                notification: { title: 'Test Title', body: 'Test Body' },
                token: 'deviceToken123'
            });
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true, messageId: mockMessageId });
        });

        it('should throw error for missing required fields', async () => {
            mockReq.body = { token: 'deviceToken123' }; // Missing title and body

            await sendPushNotification(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockNext).toHaveBeenCalledWith(new Error('FCM token, title, and body are required'));
        });

        it('should handle Firebase messaging errors', async () => {
            const firebaseError = new Error('Firebase messaging error');
            mockReq.body = {
                token: 'deviceToken123',
                title: 'Test Title',
                body: 'Test Body'
            };

            messaging.send.mockRejectedValue(firebaseError);

            await sendPushNotification(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockNext).toHaveBeenCalledWith(new Error('Failed to send push notification.'));
        });
    });
});
