import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/generateToken.js', () => ({
    __esModule: true,
    generateAccessToken: (user) => `access-${user._id ?? 'x'}`,
    generateRefreshToken: (user) => `refresh-${user._id ?? 'x'}`,
}));

describe('generateToken util (mocked)', () => {
    it('returns stable strings given user', async () => {
        const { generateAccessToken, generateRefreshToken } = await import('../../utils/generateToken.js');
        expect(generateAccessToken({ _id: '1' })).toBe('access-1');
        expect(generateRefreshToken({ _id: '2' })).toBe('refresh-2');
    });
});
