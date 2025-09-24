import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/userModel.js";
import { generateRefreshToken } from "../utils/generateToken.js";
import { roles } from "../config/roles.js";
import jwt from "jsonwebtoken";
import { closeSocket } from "../config/socket.js"; // Import the close function

describe("Token Refresh Endpoint (POST /api/users/refresh)", () => {
  let app, server;
  let mongoServer;
  let user;
  let validRefreshToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    // Dynamically import server after DB connection
    const serverModule = await import("../server.js");
    app = serverModule.default;
    server = serverModule.server;
    // Set secrets for JWT for the test environment
    process.env.JWT_SECRET = "test-access-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await new Promise(resolve => server.close(resolve)); // Close server to allow Jest to exit
    closeSocket();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    user = await User.create({
      name: "Test User",
      email: "refresh@test.com",
      password: "password123",
      role: roles.TEACHER,
      isActive: true,
      tokenVersion: 0,
    });
    validRefreshToken = generateRefreshToken(user);
  });

  it("should return a new access token for a valid refresh token", async () => {
    const res = await request(app)
      .post("/api/users/refresh")
      .set("Cookie", [`refreshToken=${validRefreshToken}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    // Verify the new access token
    const decoded = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
    expect(decoded.id).toBe(user._id.toString());
    expect(decoded.tokenVersion).toBe(user.tokenVersion);
  });

  it("should return 401 if no refresh token is provided", async () => {
    const res = await request(app)
      .post("/api/users/refresh"); // No cookie sent

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Not authorized, no refresh token");
  });

  it("should return 401 if the refresh token is invalid or malformed", async () => {
    const res = await request(app)
      .post("/api/users/refresh")
      .set("Cookie", ["refreshToken=invalid.token.string"]);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Invalid or expired refresh token.");
  });

  it("should return 401 if the user associated with the token does not exist", async () => {
    await User.findByIdAndDelete(user._id); // Delete the user

    const res = await request(app)
      .post("/api/users/refresh")
      .set("Cookie", [`refreshToken=${validRefreshToken}`]);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("User associated with this token not found.");
  });

  it("should return 401 if the token version is outdated (session invalidated)", async () => {
    // Invalidate the user's session by incrementing tokenVersion
    user.tokenVersion += 1;
    await user.save();

    const res = await request(app)
      .post("/api/users/refresh")
      .set("Cookie", [`refreshToken=${validRefreshToken}`]); // Send the old token

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Refresh token invalidated. Please log in again.");
  });

  it("should return 403 if the user's account is deactivated", async () => {
    user.isActive = false;
    await user.save();

    const res = await request(app)
      .post("/api/users/refresh")
      .set("Cookie", [`refreshToken=${validRefreshToken}`]);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Account deactivated. Contact support.");
  });
});
