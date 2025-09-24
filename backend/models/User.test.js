import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "./userModel.js";
import { roles } from "../config/roles.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-user' },
        replSet: { count: 1 },
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    // Clear all collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }

    // Reset all mocks
    jest.clearAllMocks();

    // Setup mocks using spyOn
    const mockBuffer = Buffer.from("mockrandombytes1234567890123456");
    jest.spyOn(crypto, 'randomBytes').mockReturnValue(mockBuffer);
    jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue("mockhashedtoken")
    });

    jest.spyOn(bcrypt, 'hash').mockResolvedValue("hashedpassword");
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    jest.spyOn(jwt, 'sign').mockReturnValue("mock.jwt.token");

    // Setup environment
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_EXPIRE = "1h";
});

describe("User Model", () => {
    describe("Schema Validation", () => {
        it("should create a user with required fields", async () => {
            const userData = {
                name: "Test User",
                email: "test@example.com",
                password: "password123"
            };

            const user = new User(userData);
            const savedUser = await user.save();

            expect(savedUser.name).toBe("Test User");
            expect(savedUser.email).toBe("test@example.com");
            expect(savedUser.role).toBe(roles.STUDENT);
            expect(savedUser.isActive).toBe(true);
            expect(savedUser.isVerified).toBe(false);
            expect(savedUser.loginAttempts).toBe(0);
            expect(savedUser.tokenVersion).toBe(0);
            expect(savedUser.createdAt).toBeDefined();
            expect(savedUser.updatedAt).toBeDefined();
        });

        it("should fail validation without required fields", async () => {
            const user = new User({});
            await expect(user.save()).rejects.toThrow(/validation failed/i);
        });

        it("should enforce unique email constraint", async () => {
            await User.create({
                name: "User 1",
                email: "duplicate@example.com",
                password: "password123"
            });

            await expect(User.create({
                name: "User 2",
                email: "duplicate@example.com",
                password: "password456"
            })).rejects.toThrow(/duplicate key/i);
        });

        it("should enforce minimum password length", async () => {
            const user = new User({
                name: "Short Password User",
                email: "short@example.com",
                password: "12345" // Less than 6 characters
            });

            await expect(user.save()).rejects.toThrow(/is shorter than the minimum allowed length/i);
        });

        it("should accept valid roles", async () => {
            const validRoles = Object.values(roles);

            for (const role of validRoles) {
                const user = new User({
                    name: `User ${role}`,
                    email: `${role}@example.com`,
                    password: "password123",
                    role
                });

                const savedUser = await user.save();
                expect(savedUser.role).toBe(role);
            }
        });

        it("should reject invalid roles", async () => {
            const user = new User({
                name: "Invalid Role User",
                email: "invalid@example.com",
                password: "password123",
                role: "invalid_role"
            });

            await expect(user.save()).rejects.toThrow(/is not a valid enum value/i);
        });
    });

    describe("Password Hashing", () => {
        it("should hash password before saving", async () => {
            const user = new User({
                name: "Hash Test User",
                email: "hash@example.com",
                password: "plaintextpassword"
            });

            await user.save();

            expect(bcrypt.hash).toHaveBeenCalledWith("plaintextpassword", 12);
            expect(user.password).toBe("hashedpassword");
            expect(user.lastPasswordChange).toBeDefined();
        });

        it("should not rehash password if not modified", async () => {
            const user = await User.create({
                name: "No Rehash User",
                email: "norehash@example.com",
                password: "password123"
            });

            bcrypt.hash.mockClear();

            user.name = "Updated Name";
            await user.save();

            expect(bcrypt.hash).not.toHaveBeenCalled();
        });

        it("should update lastPasswordChange on password modification", async () => {
            const user = await User.create({
                name: "Password Change User",
                email: "passwordchange@example.com",
                password: "oldpassword"
            });

            const originalChangeTime = user.lastPasswordChange;

            user.password = "newpassword";
            await user.save();

            expect(user.lastPasswordChange.getTime()).toBeGreaterThan(originalChangeTime.getTime());
        });
    });

    describe("Verification Token Generation", () => {
        it("should generate verification token for new unverified users", async () => {
            const user = new User({
                name: "Verify User",
                email: "verify@example.com",
                password: "password123",
                isVerified: false
            });

            await user.save();

            expect(crypto.randomBytes).toHaveBeenCalledWith(32);
            expect(user.verificationToken).toBe("6d6f636b72616e646f6d627974657331323334353637383930313233343536");
            expect(user.verificationTokenExpires).toBeDefined();
            expect(user.verificationTokenExpires.getTime()).toBeGreaterThan(Date.now());
        });

        it("should not generate verification token for already verified users", async () => {
            crypto.randomBytes.mockClear();

            const user = new User({
                name: "Already Verified User",
                email: "verified@example.com",
                password: "password123",
                isVerified: true
            });

            await user.save();

            expect(crypto.randomBytes).not.toHaveBeenCalled();
            expect(user.verificationToken).toBeUndefined();
        });
    });

    describe("Instance Methods", () => {
        describe("matchPassword", () => {
            it("should return true for correct password", async () => {
                const user = new User({
                    name: "Match Password User",
                    email: "match@example.com",
                    password: "hashedpassword"
                });

                const result = await user.matchPassword("enteredpassword");

                expect(bcrypt.compare).toHaveBeenCalledWith("enteredpassword", "hashedpassword");
                expect(result).toBe(true);
            });

            it("should return false for incorrect password", async () => {
                bcrypt.compare.mockResolvedValueOnce(false);

                const user = new User({
                    name: "Wrong Password User",
                    email: "wrong@example.com",
                    password: "hashedpassword"
                });

                const result = await user.matchPassword("wrongpassword");

                expect(result).toBe(false);
            });

            it("should return false for missing password", async () => {
                const user = new User({
                    name: "No Password User",
                    email: "nopassword@example.com"
                });

                const result = await user.matchPassword("somepassword");
                expect(result).toBe(false);
            });

            it("should return false for empty entered password", async () => {
                const user = new User({
                    name: "Empty Password User",
                    email: "empty@example.com",
                    password: "hashedpassword"
                });

                const result = await user.matchPassword("");
                expect(result).toBe(false);
            });
        });

        describe("generateJWT", () => {
            it("should generate JWT with correct payload", async () => {
                const schoolId = new mongoose.Types.ObjectId();
                const user = await User.create({
                    name: "JWT User",
                    email: "jwt@example.com",
                    password: "password123",
                    role: roles.TEACHER,
                    school: schoolId,
                    tokenVersion: 5
                });

                const token = user.generateJWT();

                expect(jwt.sign).toHaveBeenCalledWith(
                    {
                        id: user._id,
                        role: roles.TEACHER,
                        school: schoolId,
                        tokenVersion: 5
                    },
                    "test-jwt-secret",
                    { expiresIn: "1h" }
                );
                expect(token).toBe("mock.jwt.token");
            });

            it("should use default JWT expire time when not set", async () => {
                delete process.env.JWT_EXPIRE;

                const user = await User.create({
                    name: "Default Expire User",
                    email: "defaultexpire@example.com",
                    password: "password123"
                });

                user.generateJWT();

                expect(jwt.sign).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.any(String),
                    { expiresIn: "30m" }
                );
            });
        });

        describe("getResetPasswordToken", () => {
            it("should generate and hash reset password token", async () => {
                const user = await User.create({
                    name: "Reset Password User",
                    email: "reset@example.com",
                    password: "password123"
                });

                const resetToken = user.getResetPasswordToken();

                expect(crypto.randomBytes).toHaveBeenCalledWith(20);
                expect(crypto.createHash).toHaveBeenCalledWith("sha256");
                expect(user.passwordResetToken).toBe("mockhashedtoken");
                expect(user.passwordResetExpires).toBeDefined();
                expect(user.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
                expect(resetToken).toBe("6d6f636b72616e646f6d627974657331323334353637383930313233343536");
            });
        });

        describe("Login Attempts Management", () => {
            it("should increment login attempts", async () => {
                const user = await User.create({
                    name: "Login Attempts User",
                    email: "loginattempts@example.com",
                    password: "password123"
                });

                await user.incLoginAttempts();

                expect(user.loginAttempts).toBe(1);
            });

            it("should lock account after threshold attempts", async () => {
                const user = await User.create({
                    name: "Lock Account User",
                    email: "lock@example.com",
                    password: "password123"
                });

                // Simulate reaching threshold
                user.loginAttempts = 4;
                await user.incLoginAttempts();

                expect(user.loginAttempts).toBe(0); // Reset after lock
                expect(user.lockoutCount).toBe(1);
                expect(user.lockUntil).toBeDefined();
                expect(user.lockUntil.getTime()).toBeGreaterThan(Date.now());
            });

            it("should exponentially increase lock time", async () => {
                const user = await User.create({
                    name: "Exponential Lock User",
                    email: "exponential@example.com",
                    password: "password123",
                    lockoutCount: 2
                });

                user.loginAttempts = 4;
                await user.incLoginAttempts();

                // Should be locked for 30 * 2^2 = 120 minutes = 2 hours
                const expectedLockTime = 120 * 60 * 1000; // 2 hours in ms
                const actualLockTime = user.lockUntil.getTime() - Date.now();

                expect(actualLockTime).toBeGreaterThan(expectedLockTime - 1000);
                expect(actualLockTime).toBeLessThan(expectedLockTime + 1000);
            });

            it("should cap lock time at 24 hours", async () => {
                const user = await User.create({
                    name: "Max Lock User",
                    email: "maxlock@example.com",
                    password: "password123",
                    lockoutCount: 10 // Very high lockout count
                });

                user.loginAttempts = 4;
                await user.incLoginAttempts();

                const lockDuration = user.lockUntil.getTime() - Date.now();
                const maxLockDuration = 24 * 60 * 60 * 1000; // 24 hours in ms

                expect(lockDuration).toBeLessThanOrEqual(maxLockDuration);
            });

            it("should not increment attempts when already locked", async () => {
                const user = await User.create({
                    name: "Already Locked User",
                    email: "already@example.com",
                    password: "password123",
                    lockUntil: new Date(Date.now() + 10000), // Locked for 10 seconds
                    loginAttempts: 2
                });

                await user.incLoginAttempts();

                expect(user.loginAttempts).toBe(2); // Should not increment
            });

            it("should reset login attempts on successful login", async () => {
                const user = await User.create({
                    name: "Reset Attempts User",
                    email: "reset@example.com",
                    password: "password123",
                    loginAttempts: 3,
                    lockoutCount: 2,
                    lockUntil: new Date(Date.now() + 10000)
                });

                await user.resetLoginAttempts();

                expect(user.loginAttempts).toBe(0);
                expect(user.lockoutCount).toBe(0);
                expect(user.lockUntil).toBeNull();
            });
        });

        describe("Token Invalidation", () => {
            it("should increment token version", async () => {
                const user = await User.create({
                    name: "Invalidate Token User",
                    email: "invalidate@example.com",
                    password: "password123",
                    tokenVersion: 3
                });

                await user.invalidateTokens();

                expect(user.tokenVersion).toBe(4);
            });
        });
    });

    describe("MFA Fields", () => {
        it("should have MFA fields with select: false", async () => {
            const user = await User.create({
                name: "MFA User",
                email: "mfa@example.com",
                password: "password123",
                isMfaEnabled: true,
                mfaSecret: "secret123",
                mfaRecoveryCodes: ["code1", "code2"]
            });

            // Fields should be saved but not selected by default
            const foundUser = await User.findById(user._id);
            expect(foundUser.isMfaEnabled).toBeUndefined();
            expect(foundUser.mfaSecret).toBeUndefined();
            expect(foundUser.mfaRecoveryCodes).toBeUndefined();

            // Should be selectable when explicitly requested
            const foundUserWithMFA = await User.findById(user._id).select("+isMfaEnabled +mfaSecret +mfaRecoveryCodes");
            expect(foundUserWithMFA.isMfaEnabled).toBe(true);
            expect(foundUserWithMFA.mfaSecret).toBe("secret123");
            expect(foundUserWithMFA.mfaRecoveryCodes).toEqual(["code1", "code2"]);
        });
    });

    describe("Password Field Security", () => {
        it("should not select password by default", async () => {
            await User.create({
                name: "Password Security User",
                email: "passwordsecurity@example.com",
                password: "password123"
            });

            const foundUser = await User.findOne({ email: "passwordsecurity@example.com" });
            expect(foundUser.password).toBeUndefined();
        });

        it("should allow explicit password selection", async () => {
            await User.create({
                name: "Explicit Password User",
                email: "explicit@example.com",
                password: "password123"
            });

            const foundUser = await User.findOne({ email: "explicit@example.com" }).select("+password");
            expect(foundUser.password).toBe("hashedpassword");
        });
    });

    describe("Timestamps", () => {
        it("should set createdAt and updatedAt automatically", async () => {
            const beforeCreate = new Date();

            const user = await User.create({
                name: "Timestamp User",
                email: "timestamp@example.com",
                password: "password123"
            });

            const afterCreate = new Date();

            expect(user.createdAt).toBeDefined();
            expect(user.updatedAt).toBeDefined();
            expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(user.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt on save", async () => {
            const user = await User.create({
                name: "Update Timestamp User",
                email: "updatetimestamp@example.com",
                password: "password123"
            });

            const firstUpdate = user.updatedAt;

            // Wait a bit and update
            await new Promise(resolve => setTimeout(resolve, 10));
            user.name = "Updated Name";
            await user.save();

            expect(user.updatedAt.getTime()).toBeGreaterThan(firstUpdate.getTime());
        });
    });
});
