import rateLimit from "express-rate-limit";

/**
 * A strict rate limiter for sensitive authentication actions like login,
 * MFA verification, and token refreshing. This helps prevent brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Keep strict in production; disable in development
  max: process.env.NODE_ENV === 'production' ? 10 : 10000,
  skip: process.env.NODE_ENV === 'production' ? undefined : () => true,
  message: {
    message: "Too many login attempts from this IP. Please try again after 15 minutes.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

