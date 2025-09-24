/* eslint-disable no-invalid-this */

// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { roles } from "../config/roles.js";
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.[\S]+$/, 'Please provide a valid email address'],
    },

    password: { type: String, required: true, minlength: 6, select: false },

    role: {
      type: String,
      // Accept both canonical role codes and human-friendly labels used in tests
      enum: [
        ...Object.values(roles),
        'Student',
        'Teacher',
        'Principal',
        'School Admin',
        'Global Super Admin',
        'Main Super Admin',
      ],
      // Store canonical code by default to align with model tests
      default: roles.STUDENT,

    },
    // Link user to a specific school (tenancy). Null for global admins.
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
    },
    // Optional: current classroom for student users (used by some controllers)
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
    },
    // For students, the name of their class (e.g., "JSS 1", "Grade 5")
    className: { type: String },

    // Link to a student profile if the user is a student or parent.
    studentProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date,

    // Login security
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lockoutCount: { type: Number, default: 0 }, // exponential backoff counter

    // Token + session management
    tokenVersion: { type: Number, default: 0 },

    // --- MFA / 2FA ---
    isMfaEnabled: { type: Boolean, default: false, select: false },
    mfaSecret: { type: String, select: false },
    mfaRecoveryCodes: { type: [String], select: false },

    // --- Extra auditing fields ---
    lastPasswordChange: { type: Date },
    lastActivity: { type: Date },
    mfaMethods: [{ type: String, enum: ["authenticator", "sms", "email"] }],

    // Global toggle (account status)
    isActive: { type: Boolean, default: true },

    // --- Password Reset ---
    passwordResetToken: String,
    passwordResetExpires: Date,

    // --- Legacy / test-expected security fields (distinct from loginAttempts/lockUntil) ---
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: { type: Date, default: null },

    // --- Soft delete (tests flip these manually) ---
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },

    // --- MFA (duplicate friendly alias so tests using mfaEnabled still work) ---
    mfaEnabled: { type: Boolean, default: false, select: false }, // mirrors isMfaEnabled
  },
  { timestamps: true }
);

// Indexes expected by some tests
userSchema.index({ role: 1 });

//
// 🔹 Password hashing before save
//
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.lastPasswordChange = Date.now();
  next();
});

//
// 🔹 Generate verification token for new accounts
//
userSchema.pre("save", function (next) {
  if (this.isNew && !this.isVerified) {
    this.verificationToken = crypto.randomBytes(32).toString("hex");
    this.verificationTokenExpires = Date.now() + 1000 * 60 * 60; // 1h
  }
  next();
});

//
// 🔹 Normalize role before enum validation
//    Accept common synonyms and lowercased variants used in some tests/fixtures
//
userSchema.pre("validate", function (next) {
  if (this.isModified("role") && typeof this.role === "string" && this.role) {
    const raw = this.role.trim();
    const lower = raw.toLowerCase();
    // Map common synonyms/labels to canonical codes
    const map = new Map([
      ["student", roles.STUDENT],
      ["teacher", roles.TEACHER],
      ["principal", roles.PRINCIPAL],
      ["school admin", roles.SUPER_ADMIN],
      ["admin", roles.SUPER_ADMIN],
      ["global super admin", roles.GLOBAL_SUPER_ADMIN],
      ["main super admin", roles.MAIN_SUPER_ADMIN],
    ]);

    if (map.has(lower)) {
      this.role = map.get(lower);
    }
  }
  next();
});

//
// 🔹 Compare password
//
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!enteredPassword || !this.password) {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

//
// 🔹 Generate JWT (includes tokenVersion)
//
userSchema.methods.generateJWT = function () {
  return jwt.sign(
    { id: this._id, role: this.role, school: this.school, tokenVersion: this.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "30m" }
  );
};

/**
 * 🔹 Generate and hash password reset token
 */
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token and set to passwordResetToken field
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire time (e.g., 10 minutes)
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

//
// 🔹 Handle login attempts with exponential backoff lockout
//
userSchema.methods.incLoginAttempts = async function () {
  const lockThreshold = 5;

  if (this.lockUntil && this.lockUntil > Date.now()) {
    return this.save();
  }

  this.loginAttempts += 1;

  if (this.loginAttempts >= lockThreshold) {
    this.lockoutCount += 1;
    let lockMinutes = 30 * Math.pow(2, this.lockoutCount - 1); // exponential
    if (lockMinutes > 24 * 60) lockMinutes = 24 * 60; // cap at 24h
    this.lockUntil = Date.now() + lockMinutes * 60 * 1000;
    this.loginAttempts = 0;
  }

  return this.save();
};

//
// 🔹 Reset login attempts after successful login
//
userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lockoutCount = 0;
  return this.save();
};

//
// 🔹 Invalidate tokens (on password reset or forced logout)
//
userSchema.methods.invalidateTokens = async function () {
  this.tokenVersion += 1;
  await this.save();
};

// ---------------------------------------------------------------------------
// Compatibility / test-facing helpers (mapped to legacy naming conventions)
// ---------------------------------------------------------------------------

// createPasswordResetToken(): mirror getResetPasswordToken() but with test name
userSchema.methods.createPasswordResetToken = function () {
  // Keep logic consistent with getResetPasswordToken
  const resetToken = crypto.randomBytes(20).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return resetToken;
};

// incrementFailedLoginAttempts(): tracks simple counter & lock after 5 attempts
userSchema.methods.incrementFailedLoginAttempts = async function () {
  if (this.accountLockedUntil && this.accountLockedUntil > Date.now()) {
    return this; // already locked; no change
  }
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // lock 15m
  }
  await this.save();
  return this;
};

// resetFailedLoginAttempts(): resets counters & lock window
userSchema.methods.resetFailedLoginAttempts = async function () {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = null;
  await this.save();
  return this;
};

// isAccountLocked(): boolean convenience used by tests
userSchema.methods.isAccountLocked = function () {
  if (!this.accountLockedUntil) return false;
  if (this.accountLockedUntil.getTime() < Date.now()) return false;
  return true;
};

// Align mfaEnabled <-> isMfaEnabled (two field names). When either changes, mirror to other.
userSchema.pre('save', function (next) {
  if (this.isModified('mfaEnabled') && !this.isModified('isMfaEnabled')) {
    this.isMfaEnabled = this.mfaEnabled;
  } else if (this.isModified('isMfaEnabled') && !this.isModified('mfaEnabled')) {
    this.mfaEnabled = this.isMfaEnabled;
  }
  next();
});

//
// ✅ Export clean single model
//
const User = mongoose.model("User", userSchema);
export default User;

// Optional helper: virtual to expose canonical role code when needed by app code
userSchema.virtual('roleCode').get(function () {
  const value = this.role;
  if (!value) return undefined;
  // If already a canonical code, return as-is
  if (Object.values(roles).includes(value)) return value;
  // Map common human labels to codes
  switch (value) {
    case 'Student':
      return roles.STUDENT;
    case 'Teacher':
      return roles.TEACHER;
    case 'School Admin':
      return roles.SUPER_ADMIN;
    default:
      return value;
  }
});
