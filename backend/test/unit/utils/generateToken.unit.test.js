import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
    __esModule: true,
    default: {
        sign: vi.fn(),
        verify: vi.fn(),
    },
}));

import jwt from 'jsonwebtoken';
import {
    generateAccessToken,
    generateRefreshToken,
    generateMfaToken,
    verifyToken,
    generateTokens,
    generateToken,
} from '../../../utils/generateToken.js';

const user = { _id: 'user123', role: 'ADMIN', tokenVersion: 2 };

describe('utils/generateToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_SECRET = 'secret';
        process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    });

    it('generateAccessToken signs with claims and expiry', () => {
        jwt.sign.mockReturnValue('access');
        const token = generateAccessToken(user, '1h');
        expect(token).toBe('access');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: user._id, role: user.role, tokenVersion: 2 },
            'secret',
            { expiresIn: '1h' }
        );
    });

    it('generateRefreshToken signs with jwtid and refresh secret', () => {
        jwt.sign.mockReturnValue('refresh');
        const token = generateRefreshToken(user, '7d');
        expect(token).toBe('refresh');
        expect(jwt.sign).toHaveBeenCalled();
        const args = jwt.sign.mock.calls[0];
        expect(args[1]).toBe('refresh-secret');
        expect(args[2]).toHaveProperty('jwtid');
    });

    it('generateRefreshToken falls back to JWT_SECRET when refresh secret missing', () => {
        delete process.env.JWT_REFRESH_SECRET;
        jwt.sign.mockReturnValue('refresh');
        const token = generateRefreshToken(user, '7d');
        expect(token).toBe('refresh');
        const args = jwt.sign.mock.calls[0];
        expect(args[1]).toBe('secret');
    });

    it('generateAccessToken uses default expiry from env when not provided', () => {
        jwt.sign.mockReturnValue('access');
        process.env.JWT_EXPIRE = '90m';
        const token = generateAccessToken(user);
        expect(token).toBe('access');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: user._id, role: user.role, tokenVersion: 2 },
            'secret',
            { expiresIn: '90m' }
        );
    });

    it('generateAccessToken falls back to 1h when JWT_EXPIRE missing', () => {
        jwt.sign.mockReturnValue('access');
        delete process.env.JWT_EXPIRE;
        const token = generateAccessToken(user);
        expect(token).toBe('access');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: user._id, role: user.role, tokenVersion: 2 },
            'secret',
            { expiresIn: '1h' }
        );
    });

    it('generateRefreshToken uses default refresh expiry from env when not provided', () => {
        jwt.sign.mockReturnValue('refresh');
        process.env.JWT_REFRESH_EXPIRE = '10d';
        const token = generateRefreshToken(user);
        expect(token).toBe('refresh');
        const args = jwt.sign.mock.calls[0];
        expect(args[2]).toMatchObject({ expiresIn: '10d' });
    });

    it('generateRefreshToken falls back to 30d when env missing and no arg provided', () => {
        jwt.sign.mockReturnValue('refresh');
        delete process.env.JWT_REFRESH_EXPIRE;
        const token = generateRefreshToken(user);
        expect(token).toBe('refresh');
        const args = jwt.sign.mock.calls[0];
        expect(args[2]).toMatchObject({ expiresIn: '30d' });
    });

    it('generateMfaToken signs with mfa flag and short expiry', () => {
        jwt.sign.mockReturnValue('mfa');
        const token = generateMfaToken(user);
        expect(token).toBe('mfa');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: user._id, mfa: true },
            'secret',
            { expiresIn: '5m' }
        );
    });

    it('verifyToken returns decoded payload or throws', () => {
        const payload = { id: 'user123' };
        jwt.verify = vi.fn().mockReturnValue(payload);
        expect(verifyToken('t')).toEqual(payload);

        jwt.verify.mockImplementation(() => { throw new Error('bad'); });
        expect(() => verifyToken('t')).toThrow('Invalid or expired token');
    });

    it('generateTokens returns both tokens', () => {
        jwt.sign
            .mockReturnValueOnce('access')
            .mockReturnValueOnce('refresh');
        const { accessToken, refreshToken } = generateTokens(user, '1h', '7d');
        expect(accessToken).toBe('access');
        expect(refreshToken).toBe('refresh');
    });

    it('legacy generateToken(id) signs basic token', () => {
        jwt.sign.mockReturnValue('legacy');
        const t = generateToken('id1', '2h');
        expect(t).toBe('legacy');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: 'id1', tokenVersion: 0 },
            'secret',
            { expiresIn: '2h' }
        );
    });

    it('legacy generateToken(id) uses default expiry from env or 1h fallback', () => {
        // env provided
        jwt.sign.mockReturnValue('legacy1');
        process.env.JWT_EXPIRE = '3h';
        let t = generateToken('id2');
        expect(t).toBe('legacy1');
        expect(jwt.sign).toHaveBeenLastCalledWith(
            { id: 'id2', tokenVersion: 0 },
            'secret',
            { expiresIn: '3h' }
        );

        // env missing -> fallback to 1h
        jwt.sign.mockReturnValue('legacy2');
        delete process.env.JWT_EXPIRE;
        t = generateToken('id3');
        expect(t).toBe('legacy2');
        expect(jwt.sign).toHaveBeenLastCalledWith(
            { id: 'id3', tokenVersion: 0 },
            'secret',
            { expiresIn: '1h' }
        );
    });

    it('generateAccessToken uses tokenVersion default when missing', () => {
        jwt.sign.mockReturnValue('access');
        const u = { _id: 'u2', role: 'USER' }; // no tokenVersion
        const token = generateAccessToken(u, '30m');
        expect(token).toBe('access');
        expect(jwt.sign).toHaveBeenCalledWith(
            { id: 'u2', role: 'USER', tokenVersion: 0 },
            'secret',
            { expiresIn: '30m' }
        );
    });

    it('generateRefreshToken uses tokenVersion default when missing', () => {
        jwt.sign.mockReturnValue('refresh');
        const u = { _id: 'u3', role: 'USER' };
        const token = generateRefreshToken(u, '5d');
        expect(token).toBe('refresh');
        const [payload] = jwt.sign.mock.calls[0];
        expect(payload).toMatchObject({ id: 'u3', role: 'USER', tokenVersion: 0 });
    });

    it('generateTokens uses env defaults when params omitted', () => {
        process.env.JWT_EXPIRE = '2h';
        process.env.JWT_REFRESH_EXPIRE = '8d';
        jwt.sign
            .mockReturnValueOnce('accessX')
            .mockReturnValueOnce('refreshX');
        const { accessToken, refreshToken } = generateTokens(user);
        expect(accessToken).toBe('accessX');
        expect(refreshToken).toBe('refreshX');
        // First call access with 2h
        expect(jwt.sign.mock.calls[0][2]).toMatchObject({ expiresIn: '2h' });
        // Second call refresh with 8d and has jwtid
        expect(jwt.sign.mock.calls[1][2]).toMatchObject({ expiresIn: '8d' });
        expect(jwt.sign.mock.calls[1][2]).toHaveProperty('jwtid');
    });

    it('generateTokens falls back to 1h/7d when env missing', () => {
        delete process.env.JWT_EXPIRE;
        delete process.env.JWT_REFRESH_EXPIRE;
        jwt.sign
            .mockReturnValueOnce('accessY')
            .mockReturnValueOnce('refreshY');
        const { accessToken, refreshToken } = generateTokens(user);
        expect(accessToken).toBe('accessY');
        expect(refreshToken).toBe('refreshY');
        expect(jwt.sign.mock.calls[0][2]).toMatchObject({ expiresIn: '1h' });
        expect(jwt.sign.mock.calls[1][2]).toMatchObject({ expiresIn: '7d' });
    });
});
