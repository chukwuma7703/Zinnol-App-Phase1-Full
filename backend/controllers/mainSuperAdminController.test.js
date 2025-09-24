import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import { getMainSuperAdminOverview } from "../controllers/mainSuperAdminController.js";
import School from "../models/School.js";
import User from "../models/userModel.js";
import { roles } from "../config/roles.js";
import errorHandler from "../middleware/errorMiddleware.js";

let mongoServer;
let app;

beforeAll(async () => {
  jest.setTimeout(60000);
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Set up Express app for integration tests
  app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = {
      _id: "507f1f77bcf86cd799439011",
      role: "MAIN_SUPER_ADMIN",
      school: null
    };
    next();
  });

  // Set up routes
  app.get("/api/main-super-admin/overview", getMainSuperAdminOverview);

  // Error handling middleware
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Main Super Admin Controller", () => {
  describe("getMainSuperAdminOverview", () => {
    it("should return overview statistics for main super admin", async () => {
      const mockSchools = [
        { _id: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439013" }
      ];

      const mockUsers = [
        { _id: "507f1f77bcf86cd799439014", role: roles.SUPER_ADMIN, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439015", role: roles.PRINCIPAL, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439016", role: roles.TEACHER, school: "507f1f77bcf86cd799439013" },
        { _id: "507f1f77bcf86cd799439017", role: roles.PARENT, school: "507f1f77bcf86cd799439013" },
        { _id: "507f1f77bcf86cd799439018", role: roles.STUDENT, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439019", role: roles.STUDENT, school: "507f1f77bcf86cd799439013" }
      ];

      School.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSchools)
      });

      User.find = jest.fn().mockResolvedValue(mockUsers);

      const res = await request(app)
        .get("/api/main-super-admin/overview");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalSchools", 2);
      expect(res.body).toHaveProperty("totalSuperAdmins", 1);
      expect(res.body).toHaveProperty("totalPrincipals", 1);
      expect(res.body).toHaveProperty("totalTeachers", 1);
      expect(res.body).toHaveProperty("totalParents", 1);
      expect(res.body).toHaveProperty("totalStudents", 2);
      expect(res.body).toHaveProperty("totalUsers", 6);
      expect(res.body).toHaveProperty("onlineUsers", 0);
      expect(res.body).toHaveProperty("offlineUsers", 6);
      expect(School.find).toHaveBeenCalledWith({ mainSuperAdmins: "507f1f77bcf86cd799439011" });
      expect(User.find).toHaveBeenCalledWith({ school: { $in: ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"] } });
    });

    it("should return zero counts when no schools found", async () => {
      School.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      User.find = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get("/api/main-super-admin/overview");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalSchools", 0);
      expect(res.body).toHaveProperty("totalSuperAdmins", 0);
      expect(res.body).toHaveProperty("totalPrincipals", 0);
      expect(res.body).toHaveProperty("totalTeachers", 0);
      expect(res.body).toHaveProperty("totalParents", 0);
      expect(res.body).toHaveProperty("totalStudents", 0);
      expect(res.body).toHaveProperty("totalUsers", 0);
      expect(res.body).toHaveProperty("onlineUsers", 0);
      expect(res.body).toHaveProperty("offlineUsers", 0);
    });

    it("should handle schools with no users", async () => {
      const mockSchools = [
        { _id: "507f1f77bcf86cd799439012" }
      ];

      School.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSchools)
      });

      User.find = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get("/api/main-super-admin/overview");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalSchools", 1);
      expect(res.body).toHaveProperty("totalUsers", 0);
      expect(res.body).toHaveProperty("offlineUsers", 0);
    });

    it("should count users with mixed roles correctly", async () => {
      const mockSchools = [
        { _id: "507f1f77bcf86cd799439012" }
      ];

      const mockUsers = [
        { _id: "507f1f77bcf86cd799439014", role: roles.STUDENT, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439015", role: roles.STUDENT, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439016", role: roles.STUDENT, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439017", role: roles.TEACHER, school: "507f1f77bcf86cd799439012" },
        { _id: "507f1f77bcf86cd799439018", role: roles.TEACHER, school: "507f1f77bcf86cd799439012" }
      ];

      School.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockSchools)
      });

      User.find = jest.fn().mockResolvedValue(mockUsers);

      const res = await request(app)
        .get("/api/main-super-admin/overview");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalStudents", 3);
      expect(res.body).toHaveProperty("totalTeachers", 2);
      expect(res.body).toHaveProperty("totalSuperAdmins", 0);
      expect(res.body).toHaveProperty("totalPrincipals", 0);
      expect(res.body).toHaveProperty("totalParents", 0);
      expect(res.body).toHaveProperty("totalUsers", 5);
    });
  });
});
