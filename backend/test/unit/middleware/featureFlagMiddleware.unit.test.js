import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../models/FeatureFlag.js', () => ({ __esModule: true, default: { findOne: vi.fn() } }));

import { checkFeatureFlag, clearFeatureFlagCache } from '../../../middleware/featureFlagMiddleware.js';
import FeatureFlag from '../../../models/FeatureFlag.js';

const next = vi.fn();
const res = {};

// Helper to mock the chain: FeatureFlag.findOne(...).lean().
const mockFindOneLean = (value) => {
    const lean = vi.fn().mockResolvedValue(value);
    FeatureFlag.findOne.mockReturnValue({ lean });
    return { lean };
};

const run = async (enabled) => {
    const req = {};
    clearFeatureFlagCache();
    const value = enabled === null ? null : { name: 'X', isEnabled: !!enabled };
    mockFindOneLean(value);
    const mw = checkFeatureFlag('X');
    await mw(req, res, next);
};

describe('featureFlagMiddleware', () => {
    beforeEach(() => vi.clearAllMocks());

    it('allows when enabled', async () => {
        await run(true);
        expect(next).toHaveBeenCalledWith();
    });

    it('denies when disabled or missing', async () => {
        await run(false);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));

        next.mockClear();
        await run(null);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    });

    it('uses cache on repeated calls', async () => {
        const req = {}; clearFeatureFlagCache();
        mockFindOneLean({ name: 'X', isEnabled: true });
        const mw = checkFeatureFlag('X');
        await mw(req, res, next); // populates cache
        vi.clearAllMocks();
        await mw(req, res, next); // should hit cache (no new DB call)
        expect(FeatureFlag.findOne).not.toHaveBeenCalled();
    });
});
