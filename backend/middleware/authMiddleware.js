import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import AppError from "../utils/AppError.js";
import { roles } from "../config/roles.js";
export { roles };

/**
 * Middleware to protect routes by verifying the JWT from the request header.
 * - Verifies the token's signature and expiration.
 * - Checks the tokenVersion to support forced logout scenarios (e.g., after a password change).
 * - Ensures the user's account is active.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @param {import("express").NextFunction} next - The Express next function.
 * @return {Promise<void>} Resolves if authorized, throws an error otherwise.
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("Not authorized, no token provided.", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("+tokenVersion +isActive +role +school");
    if (!user) {
      return next(new AppError("Not authorized, user not found.", 401));
    }

    if (decoded.tokenVersion !== user.tokenVersion) {
      return next(new AppError("Session expired. Please log in again.", 401));
    }

    if (!user.isActive) {
      return next(new AppError("Forbidden, account deactivated. Contact support.", 403));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Session expired. Please log in again.", 401));
    }
    return next(new AppError("Not authorized, token failed verification.", 401));
  }
});

/*
* Middleware to protect the second step of an MFA login.
* It verifies a short-lived JWT that was issued after password verification.
*/
export const protectMfa = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("Not authorized, no MFA token provided.", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Crucially, check for the 'mfa: true' claim
    if (!decoded.mfa) {
      return next(new AppError("Not authorized, invalid token type.", 401));
    }

    // We don't need to check the DB here, as this token is very short-lived
    // and only grants access to one specific action. The user ID is trusted from the payload.
    req.user = { id: decoded.id }; // Attach a minimal user object
    next();
  } catch (error) {
    return next(
      new AppError("Not authorized, MFA token failed or expired.", 401)
    );
  }
});

/*
* Role-based authorization middleware factory.
* This middleware should be used after the `protect` middleware.
*
* @param {string[]} [allowedRoles] - An array of role identifiers that are permitted to access the route. Defaults to an empty array.
* @returns {import("express").RequestHandler} A middleware function that checks user roles.
*/


export const authorizeRoles = (allowedRoles = []) => {
  return (req, res, next) => {
    // Ensure the `protect` middleware has run and populated `req.user`.
    if (!req.user) {
      return next(new AppError("Authentication required. Please log in.", 401));
    }

    // Check if the authenticated user's role is included in the allowed roles list.
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(`Forbidden: Access denied. Required role(s): ${allowedRoles.join(", ")}`, 403));
    }

    next();
  };
};

/**
 * Middleware to authorize ONLY the designated Global Super Admin (CEO).
 * Checks role and matches email against an environment variable.
 * This should be used after the `protect` middleware.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @param {import("express").NextFunction} next - The Express next function.
 */
export const authorizeGlobalAdmin = asyncHandler(async (req, res, next) => {
  const { role, email } = req.user;
  const ceoEmail = process.env.ZINNOL_CEO_EMAIL;

  if (!ceoEmail) {
    console.error("ZINNOL_CEO_EMAIL environment variable is not set. Global Super Admin access is blocked.");
    return next(new AppError("Server configuration error, access denied.", 500));
  }

  if (role !== roles.GLOBAL_SUPER_ADMIN || email !== ceoEmail) {
    return next(new AppError("Forbidden: Only Global Super Admin (CEO) allowed.", 403));
  }

  // Optionally, re-verify the token if needed (not strictly necessary if protect already ran)
  // let token;
  // const authHeader = req.headers.authorization;
  // if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
  //   token = authHeader.split(" ")[1];
  // }
  // if (!token) {
  //   return next(new AppError("Not authorized, no token provided.", 401));
  // }
  // try {
  //   jwt.verify(token, process.env.JWT_SECRET);
  // } catch (error) {
  //   return next(new AppError("Not authorized, token failed verification.", 401));
  // }

  // If all checks pass, continue
  next();
});
