import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
    __esModule: true,
    default: {
        sign: vi.fn(),
        verify: vi.fn(),
    },
}));

import jwt from 'jsonwebtoken';
import { generateDeviceToken } from '../../../utils/generateToken.js';

const user = { _id: 'u1', tokenVersion: 3 };

describe('utils/generateDeviceToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.JWT_REMEMBER_EXPIRE;
    });

    it('signs device token with id, tokenVersion, and type=device', () => {
        jwt.sign.mockReturnValue('device-token');
        const token = generateDeviceToken(user);
        expect(token).toBe('device-token');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: 'u1', tokenVersion: 3, type: 'device' },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );
    });

    it('defaults tokenVersion to 0 when missing', () => {
        jwt.sign.mockReturnValue('device-token');
        const u = { _id: 'u2' };
        generateDeviceToken(u);
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: 'u2', tokenVersion: 0, type: 'device' },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );
    });

    it('uses JWT_REMEMBER_EXPIRE when provided', () => {
        process.env.JWT_REMEMBER_EXPIRE = '180d';
        jwt.sign.mockReturnValue('device-token');
        generateDeviceToken(user);
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: 'u1', tokenVersion: 3, type: 'device' },
            process.env.JWT_SECRET,
            { expiresIn: '180d' }
        );
    });
});
