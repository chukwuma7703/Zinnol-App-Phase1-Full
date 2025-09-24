import { vi, describe, it, expect, beforeEach } from 'vitest';
vi.mock('../../middleware/featureFlagMiddleware.js', () => ({
    clearFeatureFlagCache: vi.fn()
}));
import { getAllFeatureFlags, toggleFeatureFlag } from '../../controllers/featureFlagController.js';
import FeatureFlag from '../../models/FeatureFlag.js';
import AppError from '../../utils/AppError.js';
import { clearFeatureFlagCache } from '../../middleware/featureFlagMiddleware.js';

describe('Feature Flag Controller', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        mockReq = {
            params: {},
            body: {}
        };

        mockRes = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis()
        };

        mockNext = vi.fn();

        vi.clearAllMocks();
    });

    describe('getAllFeatureFlags', () => {
        it('should return all feature flags sorted by name', async () => {
            const mockFeatures = [
                { name: 'feature-b', isEnabled: true },
                { name: 'feature-a', isEnabled: false }
            ];
            const findSpy = vi.spyOn(FeatureFlag, 'find').mockReturnValue({
                sort: () => Promise.resolve(mockFeatures)
            });

            await getAllFeatureFlags(mockReq, mockRes, mockNext);

            expect(findSpy).toHaveBeenCalledWith({});
            expect(mockRes.json).toHaveBeenCalledWith(mockFeatures);
            findSpy.mockRestore();
        });

        it('should handle database errors', async () => {
            const error = new Error('Database connection failed');
            const findSpy = vi.spyOn(FeatureFlag, 'find').mockReturnValue({
                sort: () => Promise.reject(error)
            });
            await getAllFeatureFlags(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
            findSpy.mockRestore();
        });
    });

    describe('toggleFeatureFlag', () => {
        it('should toggle a feature flag successfully', async () => {
            const mockFeature = {
                name: 'test-feature',
                isEnabled: false,
                isCore: false,
                save: vi.fn().mockResolvedValue()
            };

            mockReq.params.name = 'test-feature';
            const findOneSpy = vi.spyOn(FeatureFlag, 'findOne').mockResolvedValue(mockFeature);

            await toggleFeatureFlag(mockReq, mockRes, mockNext);

            expect(findOneSpy).toHaveBeenCalledWith({ name: 'test-feature' });
            expect(mockFeature.save).toHaveBeenCalled();
            expect(mockFeature.isEnabled).toBe(true);
            expect(clearFeatureFlagCache).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith({
                message: "Feature 'test-feature' has been enabled.",
                feature: mockFeature
            });
            findOneSpy.mockRestore();
        });

        it('should disable a feature flag', async () => {
            const mockFeature = {
                name: 'test-feature',
                isEnabled: true,
                isCore: false,
                save: vi.fn().mockResolvedValue()
            };

            mockReq.params.name = 'test-feature';
            const findOneSpy = vi.spyOn(FeatureFlag, 'findOne').mockResolvedValue(mockFeature);

            await toggleFeatureFlag(mockReq, mockRes, mockNext);

            expect(mockFeature.isEnabled).toBe(false);
            expect(mockRes.json).toHaveBeenCalledWith({
                message: "Feature 'test-feature' has been disabled.",
                feature: mockFeature
            });
            findOneSpy.mockRestore();
        });

        it('should return 404 if feature not found', async () => {
            mockReq.params.name = 'non-existent-feature';
            const findOneSpy = vi.spyOn(FeatureFlag, 'findOne').mockResolvedValue(null);

            await toggleFeatureFlag(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new AppError('Feature not found.', 404));
            findOneSpy.mockRestore();
        });

        it('should prevent disabling core features', async () => {
            const mockFeature = {
                name: 'core-feature',
                isEnabled: true,
                isCore: true,
                save: vi.fn() // should NOT be called
            };

            mockReq.params.name = 'core-feature';
            const findOneSpy = vi.spyOn(FeatureFlag, 'findOne').mockResolvedValue(mockFeature);

            await toggleFeatureFlag(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(new AppError('This is a core system feature and cannot be disabled.', 400));
            expect(mockFeature.save).not.toHaveBeenCalled();
            expect(clearFeatureFlagCache).not.toHaveBeenCalled();
            findOneSpy.mockRestore();
        });

        it('should allow disabling core features if already disabled', async () => {
            const mockFeature = {
                name: 'core-feature',
                isEnabled: false,
                isCore: true,
                save: vi.fn().mockResolvedValue()
            };

            mockReq.params.name = 'core-feature';
            const findOneSpy = vi.spyOn(FeatureFlag, 'findOne').mockResolvedValue(mockFeature);

            await toggleFeatureFlag(mockReq, mockRes, mockNext);

            expect(mockFeature.save).toHaveBeenCalled();
            expect(mockFeature.isEnabled).toBe(true);
            expect(clearFeatureFlagCache).toHaveBeenCalled();
            findOneSpy.mockRestore();
        });

        it('should handle database errors during save', async () => {
            const mockFeature = {
                name: 'test-feature',
                isEnabled: false,
                isCore: false,
                save: vi.fn().mockRejectedValue(new Error('Save failed'))
            };

            mockReq.params.name = 'test-feature';
            const findOneSpy = vi.spyOn(FeatureFlag, 'findOne').mockResolvedValue(mockFeature);

            await toggleFeatureFlag(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalled();
            findOneSpy.mockRestore();
        });
    });
});
