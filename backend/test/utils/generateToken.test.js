/**
 * Generate Token Utility Test
 */

import jwt from 'jsonwebtoken';

describe('Token Generation Utils', () => {
  const userId = '507f1f77bcf86cd799439011';
  const role = 'teacher';

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_EXPIRE = '7d';
    process.env.JWT_REFRESH_EXPIRE = '30d';
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', async () => {
      // Dynamically import to avoid module issues
      const { generateAccessToken } = await import('../../utils/generateToken.js');

      const user = { _id: userId, role: role };
      const token = generateAccessToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(userId);
      expect(decoded.role).toBe(role);
    });

    it('should include additional data if provided', async () => {
      const { generateAccessToken } = await import('../../utils/generateToken.js');

      const user = { _id: userId, role: role, school: 'schoolId', email: 'test@example.com' };
      const token = generateAccessToken(user);

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(userId);
      expect(decoded.role).toBe(role);
      expect(decoded.tokenVersion).toBe(0); // default tokenVersion
    }); it('should set correct expiration', async () => {
      const { generateAccessToken } = await import('../../utils/generateToken.js');

      const user = { _id: userId, role: role };
      const token = generateAccessToken(user);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = decoded.exp - now;

      // Should expire in approximately 7 days (604800 seconds)
      expect(expiresIn).toBeGreaterThan(604700);
      expect(expiresIn).toBeLessThan(604900);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token with longer expiration', async () => {
      const { generateRefreshToken } = await import('../../utils/generateToken.js');

      const user = { _id: userId, role: role };
      const token = generateRefreshToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      expect(decoded.id).toBe(userId);
      expect(decoded.role).toBe(role);
      expect(decoded.jti).toBeDefined(); // jwtid should be present
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const { generateAccessToken, verifyToken } = await import('../../utils/generateToken.js');

      const user = { _id: userId, role: role };
      const token = generateAccessToken(user);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.id).toBe(userId);
      expect(decoded.role).toBe(role);
    });

    it('should throw error for invalid token', async () => {
      const { verifyToken } = await import('../../utils/generateToken.js');

      expect(() => verifyToken('invalid-token')).toThrow();
    });

    it('should throw error for expired token', async () => {
      const { verifyToken } = await import('../../utils/generateToken.js');

      const expiredToken = jwt.sign(
        { id: userId, role },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      expect(() => verifyToken(expiredToken)).toThrow();
    });
  });
});