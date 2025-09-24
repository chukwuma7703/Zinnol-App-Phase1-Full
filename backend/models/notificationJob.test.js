import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { deliverNotification } from '../../models/notificationJob.js';
import User from '../../models/userModel.js';
import nodemailer from 'nodemailer';

// Mock the dependencies
jest.mock('../../models/userModel.js');
jest.mock('nodemailer');

describe('Notification Delivery Service', () => {
    let mockSendMail;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Setup a mock for the sendMail function
        mockSendMail = jest.fn().mockResolvedValue(true);
        nodemailer.createTransport.mockReturnValue({
            sendMail: mockSendMail,
        });
    });

    it('should send an email and mark notification as sent', async () => {
        // 1. Arrange
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'test@example.com',
            name: 'Test User',
        };

        const mockNotification = {
            _id: new mongoose.Types.ObjectId(),
            user: mockUser._id,
            title: 'Test Event',
            message: 'This is a test notification.',
            sent: false,
            save: jest.fn().mockResolvedValue(true), // Mock the save method
        };

        // Mock the User.findById to return our mock user
        User.findById.mockResolvedValue(mockUser);

        // 2. Act
        await deliverNotification(mockNotification);

        // 3. Assert
        // Check if the user was looked up correctly
        expect(User.findById).toHaveBeenCalledWith(mockNotification.user);

        // Check if sendMail was called with the correct details
        expect(mockSendMail).toHaveBeenCalledTimes(1);
        expect(mockSendMail).toHaveBeenCalledWith({
            from: `"Zinnol Calendar" <${process.env.EMAIL_USER}>`,
            to: mockUser.email,
            subject: `Reminder: ${mockNotification.title}`,
            text: mockNotification.message,
        });

        // Check if the notification was marked as sent
        expect(mockNotification.save).toHaveBeenCalledTimes(1);
        expect(mockNotification.sent).toBe(true);
    });

    it('should not send email if user is not found', async () => {
        // 1. Arrange
        const mockNotification = {
            _id: new mongoose.Types.ObjectId(),
            user: new mongoose.Types.ObjectId(),
            save: jest.fn(),
        };

        // Mock User.findById to return null
        User.findById.mockResolvedValue(null);

        // 2. Act
        await deliverNotification(mockNotification);

        // 3. Assert
        expect(mockSendMail).not.toHaveBeenCalled();
        expect(mockNotification.save).not.toHaveBeenCalled();
    });
});