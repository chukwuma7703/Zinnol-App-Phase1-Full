import request from "supertest";
import mongoose from "mongoose";
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { TestDatabase, TestAuth } from "../testUtils.js";
import app, { server } from "../../server.js";
import User from "../../models/userModel.js";
import RefreshToken from "../../models/refreshTokenModel.js";
import { roles } from "../../config/roles.js";
import { closeSocket } from "../../config/socket.js";

describe("User Controller Auth Endpoints (/api/users)", () => {
    let globalAdmin, student, globalAdminToken, studentToken;

    beforeAll(async () => {
        await TestDatabase.setup();
    });

    afterAll(async () => {
        await TestDatabase.teardown();
        await new Promise(resolve => server.close(resolve));
        closeSocket();
    });

    beforeEach(async () => {
        await TestDatabase.clearDatabase();
        const testUsers = await TestAuth.createTestUsers();
        globalAdmin = testUsers.globalAdmin;
        student = testUsers.student;
        globalAdminToken = TestAuth.generateAuthToken(globalAdmin);
        studentToken = TestAuth.generateAuthToken(student);
    });

    describe("POST /api/users/login", () => {
        it("should login a user with correct credentials and set refresh token cookie", async () => {
            const res = await request(app)
                .post("/api/users/login")
                .send({ email: student.email, password: "password123" });

            expect(res.status).toBe(200);
            expect(res.body.accessToken).toBeDefined();
            expect(res.body.email).toBe(student.email);
            expect(res.headers['set-cookie'][0]).toContain("refreshToken=");
            expect(res.headers['set-cookie'][0]).toContain("HttpOnly");
        });

        it("should return 401 for incorrect credentials", async () => {
            const res = await request(app)
                .post("/api/users/login")
                .send({ email: student.email, password: "wrongpassword" });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe("Invalid credentials");
        });

        it("should return 403 for a deactivated account", async () => {
            await User.findByIdAndUpdate(student._id, { isActive: false });

            const res = await request(app)
                .post("/api/users/login")
                .send({ email: student.email, password: "password123" });

            expect(res.status).toBe(403);
            expect(res.body.message).toBe("Account is deactivated. Please contact support.");
        });
    });

    describe("POST /api/users/logout", () => {
        it("should clear the refresh token cookie on logout", async () => {
            // First, log in to get the cookie
            const loginRes = await request(app)
                .post("/api/users/login")
                .send({ email: student.email, password: "password123" });

            const refreshTokenCookie = loginRes.headers['set-cookie'][0];

            // Then, logout
            const logoutRes = await request(app)
                .post("/api/users/logout")
                .set("Cookie", refreshTokenCookie);

            expect(logoutRes.status).toBe(200);
            expect(logoutRes.body.message).toBe("User logged out");
            // Check that the cookie is cleared
            expect(logoutRes.headers['set-cookie'][0]).toContain("refreshToken=;");
            expect(logoutRes.headers['set-cookie'][0]).toContain("Max-Age=0");
        });
    });

    describe("POST /api/users/refresh", () => {
        it("should return 401 if the refresh token has been revoked in the database", async () => {
            // 1. Login to get a valid refresh token and cookie
            const loginRes = await request(app)
                .post("/api/users/login")
                .send({ email: student.email, password: "password123" });

            const refreshTokenCookie = loginRes.headers['set-cookie'][0];
            const refreshTokenValue = refreshTokenCookie.split(';')[0].split('=')[1];

            // 2. Manually revoke the token in the DB
            const hash = RefreshToken.hashToken(refreshTokenValue);
            await RefreshToken.findOneAndUpdate({ tokenHash: hash }, { revoked: true });

            // 3. Attempt to refresh
            const refreshRes = await request(app)
                .post("/api/users/refresh")
                .set("Cookie", refreshTokenCookie);

            expect(refreshRes.status).toBe(401);
            expect(refreshRes.body.message).toBe("Refresh token invalid or revoked");
        });
    });

    describe("GET /api/users/me", () => {
        it("should return the profile of the currently authenticated user", async () => {
            const res = await request(app)
                .get("/api/users/me")
                .set("Authorization", `Bearer ${studentToken}`);

            expect(res.status).toBe(200);
            expect(res.body.user._id).toBe(student._id.toString());
            expect(res.body.user.email).toBe(student.email);
            expect(res.body.user).not.toHaveProperty("password");
        });
    });

    describe("PUT /api/users/:id/reset-password (Admin)", () => {
        it("should allow a GLOBAL_SUPER_ADMIN to reset a user's password and invalidate their tokens", async () => {
            const originalTokenVersion = student.tokenVersion;
            const newPassword = "newPassword123";

            const res = await request(app)
                .put(`/api/users/${student._id}/reset-password`)
                .set("Authorization", `Bearer ${globalAdminToken}`)
                .send({ newPassword });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Password reset successfully");

            // Verify password was changed
            const updatedStudent = await User.findById(student._id).select('+password');
            const isMatch = await updatedStudent.matchPassword(newPassword);
            expect(isMatch).toBe(true);

            // Verify token version was incremented
            expect(updatedStudent.tokenVersion).toBe(originalTokenVersion + 1);
        });

        it("should return 400 if newPassword is not provided", async () => {
            const res = await request(app)
                .put(`/api/users/${student._id}/reset-password`)
                .set("Authorization", `Bearer ${globalAdminToken}`)
                .send({}); // No password

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("New password is required");
        });
    });
});