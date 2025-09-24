import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { generateTokens } from '../utils/generateToken.js';
import { ok as apiOk, error as apiError } from '../utils/ApiResponse.js';

const router = express.Router();

// Defer client creation until runtime to ensure env is loaded (ESM import order)
let googleClient = null;
function getGoogleClient() {
  if (googleClient) return googleClient;
  const redirectUri = process.env.NODE_ENV === 'production'
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI;
  googleClient = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  });
  return googleClient;
}

// Feature flag helper: enable full OAuth code flow (requires client secret). Default: disabled
const isCodeFlowEnabled = () => String(process.env.ENABLE_GOOGLE_CODE_FLOW || '').toLowerCase() === 'true';

// Helper to optionally enforce Google Workspace domain restriction
function enforceAllowedDomain(payload) {
  const allowedDomain = (process.env.GOOGLE_ALLOWED_DOMAIN || '').trim();
  if (!allowedDomain) return; // no restriction
  const email = payload?.email || '';
  const domain = email.split('@')[1];
  if (!domain || domain.toLowerCase() !== allowedDomain.toLowerCase()) {
    const err = new Error('Email domain not allowed');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * @route   GET /api/auth/google
 * @desc    Initiate Google OAuth flow
 * @access  Public
 */
router.get('/google', (req, res) => {
  if (!isCodeFlowEnabled()) {
    return res.status(404).send('Not Found');
  }
  const redirectUri = process.env.NODE_ENV === 'production'
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI;
  const authUrl = getGoogleClient().generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    // Explicitly include redirect_uri to avoid library defaults differing by version
    redirect_uri: redirectUri,
    // Encourage Google to issue a refresh token when appropriate
    prompt: 'consent',
    state: req.query.redirect || '/', // Optional redirect after auth
  });

  res.redirect(authUrl);
});

/**
 * @route   GET /api/auth/google/callback
 * @desc    Handle Google OAuth callback
 * @access  Public
 */
router.get('/google/callback', async (req, res) => {
  if (!isCodeFlowEnabled()) {
    return res.status(404).send('Not Found');
  }
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_cancelled`);
    }

    // Exchange code for tokens
    const client = getGoogleClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // Optional domain restriction
    try { enforceAllowedDomain(payload); } catch (e) { return res.redirect(`${process.env.FRONTEND_URL}/login?error=domain_not_allowed`); }
    const {
      sub: googleId,
      email,
      name,
      picture: avatar,
      given_name: firstName,
      family_name: lastName,
    } = payload;

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { email },
        { 'oauth.google.id': googleId }
      ]
    });

    if (user) {
      // Update existing user with Google info
      user.oauth = user.oauth || {};
      user.oauth.google = {
        id: googleId,
        email,
        verified: true,
      };
      user.avatar = user.avatar || avatar;
      user.isActive = true;
      await user.save();
    } else {
      // Create new user
      user = new User({
        email,
        name: name || `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        avatar,
        role: 'student', // Default role, can be changed by admin
        isActive: true,
        emailVerified: true, // Google emails are pre-verified
        oauth: {
          google: {
            id: googleId,
            email,
            verified: true,
          }
        },
        // Generate a random password since OAuth users don't need it
        password: Math.random().toString(36).slice(-8),
      });
      await user.save();
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user._id, user.tokenVersion);

    // Set secure cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    res.cookie('refreshToken', refreshToken, cookieOptions);

    // Redirect to frontend with access token
    const redirectUrl = state && state !== '/'
      ? `${process.env.FRONTEND_URL}${state}?token=${accessToken}`
      : `${process.env.FRONTEND_URL}/dashboard?token=${accessToken}`;

    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Google OAuth error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

/**
 * @route   POST /api/auth/google/verify
 * @desc    Verify Google ID token (for frontend-initiated OAuth)
 * @access  Public
 */
router.post('/google/verify', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return apiError(res, 400, 'ID token is required');
    }

    // Verify the ID token
    const ticket = await getGoogleClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // Optional domain restriction
    enforceAllowedDomain(payload);
    const {
      sub: googleId,
      email,
      name,
      picture: avatar,
      given_name: firstName,
      family_name: lastName,
    } = payload;

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { email },
        { 'oauth.google.id': googleId }
      ]
    });

    if (user) {
      // Update existing user
      user.oauth = user.oauth || {};
      user.oauth.google = {
        id: googleId,
        email,
        verified: true,
      };
      user.avatar = user.avatar || avatar;
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Create new user
      user = new User({
        email,
        name: name || `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        avatar,
        role: 'student',
        isActive: true,
        emailVerified: true,
        oauth: {
          google: {
            id: googleId,
            email,
            verified: true,
          }
        },
        password: Math.random().toString(36).slice(-8),
        lastLogin: new Date(),
      });
      await user.save();
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id, user.tokenVersion);

    // Set refresh token cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    res.cookie('refreshToken', refreshToken, cookieOptions);

    // Return user data and access token
    apiOk(res, {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        school: user.school,
      },
      accessToken,
    }, 'Login successful');

  } catch (error) {
    console.error('Google token verification error:', error);
    apiError(res, 401, 'Invalid Google token');
  }
});

/**
 * @route   GET /api/auth/google/status
 * @desc    Expose minimal config to verify deployment (no secrets)
 * @access  Public
 */
router.get('/google/status', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const maskedClientId = clientId ? `${clientId.slice(0, 8)}...${clientId.slice(-12)}` : null;
  return apiOk(res, {
    clientId: maskedClientId,
    codeFlowEnabled: isCodeFlowEnabled(),
    redirectUri: process.env.NODE_ENV === 'production' ? process.env.GOOGLE_REDIRECT_URI_PROD : process.env.GOOGLE_REDIRECT_URI,
  });
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and clear tokens
 * @access  Private
 */
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  apiOk(res, null, 'Logged out successfully');
});

export default router;