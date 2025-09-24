import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../models/FeatureFlag.js', () => ({ __esModule: true, default: { find: vi.fn(), findOne: vi.fn() } }));
vi.mock('../../../middleware/featureFlagMiddleware.js', () => ({ __esModule: true, clearFeatureFlagCache: vi.fn() }));

import { getAllFeatureFlags, toggleFeatureFlag } from '../../../controllers/featureFlagController.js';
import FeatureFlag from '../../../models/FeatureFlag.js';
import { clearFeatureFlagCache } from '../../../middleware/featureFlagMiddleware.js';

function mockRes() { return { json: vi.fn(), status: vi.fn().mockReturnThis() }; }

describe('featureFlagController unit (mocked model)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('getAllFeatureFlags returns sorted flags', async () => {
        const flags = [{ name: 'b', isEnabled: true }, { name: 'a', isEnabled: false }];
        // Mock find().sort({ name: 1 }) chain
        FeatureFlag.find.mockReturnValue({
            sort: () => ({ then: (resolve) => resolve(flags) })
        });
        const req = {}; const res = mockRes();
        await getAllFeatureFlags(req, res, vi.fn());
        expect(FeatureFlag.find).toHaveBeenCalledWith({});
        expect(res.json).toHaveBeenCalledWith(flags);
    });

    it('toggleFeatureFlag enables a disabled non-core feature', async () => {
        const feature = { name: 'feat', isEnabled: false, isCore: false, save: vi.fn() };
        FeatureFlag.findOne.mockResolvedValue(feature);
        const req = { params: { name: 'feat' } }; const res = mockRes();
        await toggleFeatureFlag(req, res, vi.fn());
        expect(feature.isEnabled).toBe(true);
        expect(feature.save).toHaveBeenCalled();
        expect(clearFeatureFlagCache).toHaveBeenCalled();
    });
});
