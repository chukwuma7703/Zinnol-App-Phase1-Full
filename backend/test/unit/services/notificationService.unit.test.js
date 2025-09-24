import { vi } from 'vitest';
import { sendAuthNotificationToUser } from '../../../services/notificationService.js';

// Prefixed mock variables so Jest allows referencing them inside factory
const mockNotificationCreate = vi.fn(async () => ({}));
const mockNotificationUpdate = vi.fn();
const mockUserFindById = vi.fn();
const mockSendMulticast = vi.fn();

vi.mock('../../../models/Notification.js', () => ({
    __esModule: true,
    default: { create: (...a) => mockNotificationCreate(...a), findByIdAndUpdate: (...a) => mockNotificationUpdate(...a) }
}));

vi.mock('../../../models/userModel.js', () => ({
    __esModule: true,
    default: { findById: (...a) => mockUserFindById(...a) }
}));

vi.mock('../../../config/firebaseAdmin.js', () => ({
    messaging: { sendMulticast: (...a) => mockSendMulticast(...a) }
}));

describe('notificationService sendAuthNotificationToUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.SMTP_HOST;
        mockUserFindById.mockReturnValue({ select: () => ({ fcmTokens: ['t1', 't2'], email: 'u@test.com', save: vi.fn() }) });
        mockSendMulticast.mockResolvedValue({
            successCount: 1,
            failureCount: 1,
            responses: [{ success: true }, { success: false, error: { code: 'messaging/invalid-registration-token' } }]
        });
    });

    test('returns pushed true with pruning invalid tokens', async () => {
        const result = await sendAuthNotificationToUser('u1', 'Title', 'Message');
        expect(result.pushed).toBe(true);
        expect(result.failureCount).toBe(1);
        expect(mockSendMulticast).toHaveBeenCalled();
    });

    test('returns reason no-tokens when user has no tokens', async () => {
        mockUserFindById.mockReturnValueOnce({ select: () => ({ fcmTokens: [], email: 'u@test.com' }) });
        const result = await sendAuthNotificationToUser('u1', 'T', 'M');
        expect(result).toEqual({ pushed: false, reason: 'no-tokens' });
        expect(mockSendMulticast).not.toHaveBeenCalled();
    });

    test('returns db-error when notification create throws', async () => {
        mockNotificationCreate.mockRejectedValueOnce(new Error('db down'));
        const result = await sendAuthNotificationToUser('u1', 'T', 'M');
        expect(result).toEqual({ pushed: false, reason: 'db-error' });
    });
});
