import jwt from "jsonwebtoken";
import crypto from 'crypto';

/**
 * @desc Generate an Access Token with a short lifespan.
 * @param {object} user - The user object to sign the token with.
 * @param {string} [expiresIn=process.env.JWT_EXPIRE || "1h"] - The token expiration time.
 * @return {string} The generated access token string.
 */
export const generateAccessToken = (user, expiresIn = process.env.JWT_EXPIRE || "1h") => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * @desc Generate a Refresh Token with a longer lifespan.
 * @param {object} user - The user object to sign the token with.
 * @param {string} [expiresIn=process.env.JWT_REFRESH_EXPIRE || "7d"] - The token expiration time.
 * @return {string} The generated refresh token string.
 */
export const generateRefreshToken = (user, expiresIn = process.env.JWT_REFRESH_EXPIRE || "30d") => {
  // Include a random jwtid to ensure the token string is unique even if generated
  // multiple times within the same second. This prevents duplicate tokenHash
  // collisions when persisting hashed refresh tokens for rotation.
  const jwtid = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn, jwtid }
  );
};

/**
 * @desc Generate a temporary MFA Token with a very short lifespan.
 * @param {object} user - The user object to sign the token with.
 * @return {string} The generated MFA token string.
 */
export const generateMfaToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      mfa: true, // A claim to identify this token's purpose
    },
    process.env.JWT_SECRET, // Use the main secret, it's short-lived anyway
    { expiresIn: "5m" } // User has 5 minutes to enter their 2FA code
  );
};

/**
 * @desc Generate a long-lived Device Token ("remember me") for persistent sessions.
 *        This token is validated server-side to mint a new refresh token when the
 *        refresh cookie is missing or expired. It is invalidated when tokenVersion
 *        changes (e.g., on password change) or the account is deactivated.
 * @param {object} user - The user object to sign the token with.
 * @param {string} [expiresIn=process.env.JWT_REMEMBER_EXPIRE || "365d"] - The token expiration time.
 * @return {string} The generated device token string.
 */
export const generateDeviceToken = (user, expiresIn = process.env.JWT_REMEMBER_EXPIRE || "365d") => {
  return jwt.sign(
    {
      id: user._id,
      tokenVersion: user.tokenVersion || 0,
      type: 'device',
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * @desc Verify and decode a JWT token.
 * @param {string} token - The JWT token to verify.
 * @param {string} [secret=process.env.JWT_SECRET] - The secret to verify the token with.
 * @return {object} The decoded token payload.
 * @throws {Error} If the token is invalid or expired.
 */
export const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * @desc Generate both access and refresh tokens for a user.
 * @param {object} user - The user object to sign the tokens with.
 * @param {string} [accessExpiresIn=process.env.JWT_EXPIRE || "1h"] - The access token expiration time.
 * @param {string} [refreshExpiresIn=process.env.JWT_REFRESH_EXPIRE || "7d"] - The refresh token expiration time.
 * @return {object} An object containing accessToken and refreshToken.
 */
export const generateTokens = (user, accessExpiresIn = process.env.JWT_EXPIRE || "1h", refreshExpiresIn = process.env.JWT_REFRESH_EXPIRE || "7d") => {
  const accessToken = generateAccessToken(user, accessExpiresIn);
  const refreshToken = generateRefreshToken(user, refreshExpiresIn);

  return {
    accessToken,
    refreshToken
  };
};

// Legacy compatibility: some tests import a named generateToken(id)
export const generateToken = (id, expiresIn = process.env.JWT_EXPIRE || "1h") => {
  return jwt.sign(
    {
      id,
      tokenVersion: 0,
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

