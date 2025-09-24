import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import {
  createTransaction,
  getTransactions,
  updateTransactionStatus,
  getTransactionById,
  deleteTransaction,
} from "../controllers/buserTransactionController.js";
import BuserTransaction from "../models/BuserTransaction.js";
import Student from "../models/Student.js";
import User from "../models/userModel.js";
import School from "../models/School.js";
import { roles } from "../config/roles.js";
import errorHandler from "../middleware/errorMiddleware.js";

let mongoServer;
let app;
let currentUser = {
  _id: "507f1f77bcf86cd799439011",
  role: roles.PARENT,
  school: "507f1f77bcf86cd799439012"
};
afterEach(() => {
  jest.restoreAllMocks();
});

beforeAll(async () => {
  jest.setTimeout(60000);
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = currentUser;
    next();
  });

  app.post("/api/transactions", createTransaction);
  app.get("/api/transactions", getTransactions);
  app.get("/api/transactions/:id", getTransactionById);
  app.patch("/api/transactions/:id/status", updateTransactionStatus);
  app.delete("/api/transactions/:id", deleteTransaction);
  app.use(errorHandler);
});

const setUser = (role, school = "507f1f77bcf86cd799439012") => {
  currentUser = {
    _id: "507f1f77bcf86cd799439011",
    role,
    school
  };
};

describe("Buser Transaction Controller", () => {
  describe("createTransaction", () => {
    beforeEach(() => {
      setUser(roles.PARENT);
    });

    it("should create a transaction successfully", async () => {
      const mockStudent = {
        _id: "507f1f77bcf86cd799439013",
        school: "507f1f77bcf86cd799439012"
      };

      const mockTransaction = {
        _id: "507f1f77bcf86cd799439014",
        item: "School Supplies",
        student: "507f1f77bcf86cd799439013",
        amount: 50,
        school: "507f1f77bcf86cd799439012"
      };

      jest.spyOn(Student, 'findOne').mockResolvedValue(mockStudent);
      jest.spyOn(BuserTransaction, 'create').mockResolvedValue(mockTransaction);

      const res = await request(app)
        .post("/api/transactions")
        .send({
          item: "School Supplies",
          student: "507f1f77bcf86cd799439013",
          amount: 50
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockTransaction);
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/api/transactions")
        .send({ item: "Book" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Item, student ID, and amount are required/);
    });

    it("should return 400 for non-positive amount", async () => {
      jest.spyOn(Student, 'findOne').mockResolvedValue({ _id: new mongoose.Types.ObjectId(), school: currentUser.school });
      const res = await request(app)
        .post("/api/transactions")
        .send({ item: "Book", student: new mongoose.Types.ObjectId().toString(), amount: 0 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Amount must be greater than 0/);
    });

    it("should return 403 if user has no school", async () => {
      setUser(roles.PARENT, null);
      const res = await request(app)
        .post("/api/transactions")
        .send({ item: "Book", student: new mongoose.Types.ObjectId().toString(), amount: 10 });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/not associated with a school/);
    });

    it("should return 404 if student not in user's school", async () => {
      setUser(roles.PARENT, new mongoose.Types.ObjectId().toString());
      jest.spyOn(Student, 'findOne').mockResolvedValue(null);
      const res = await request(app)
        .post("/api/transactions")
        .send({ item: "Uniform", student: new mongoose.Types.ObjectId().toString(), amount: 25 });
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Student not found in your school/);
    });
  });

  describe("getTransactions", () => {
    let schoolA, schoolB, requester;
    beforeEach(async () => {
      schoolA = new mongoose.Types.ObjectId();
      schoolB = new mongoose.Types.ObjectId();
      requester = new mongoose.Types.ObjectId();
      await School.create([{ _id: schoolA, name: 'School A' }, { _id: schoolB, name: 'School B' }]);
      // Seed three transactions across two schools
      await BuserTransaction.create([
        { item: "Uniform", student: new mongoose.Types.ObjectId(), amount: 30, school: schoolA, requestedBy: requester },
        { item: "Book", student: new mongoose.Types.ObjectId(), amount: 15, school: schoolA, requestedBy: requester, status: 'approved' },
        { item: "Shoes", student: new mongoose.Types.ObjectId(), amount: 40, school: schoolB, requestedBy: requester, status: 'declined' },
      ]);
    });

    it("should let GLOBAL_SUPER_ADMIN fetch by any school", async () => {
      setUser(roles.GLOBAL_SUPER_ADMIN, null);
      const res = await request(app).get(`/api/transactions?school=${schoolB.toString()}`).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const schoolIds = res.body.map(t => (typeof t.school === 'string' ? t.school : t.school?._id));
      expect(schoolIds.every(id => id === schoolB.toString())).toBe(true);
    });

    it("should scope non-global admin to their school and filter by status", async () => {
      setUser(roles.BUSER_ADMIN, schoolA.toString());
      const res = await request(app).get(`/api/transactions?status=approved`).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.every(t => t.status === 'approved')).toBe(true);
      // Ensure school scoping
      const allRes = await request(app).get(`/api/transactions`).expect(200);
      const allSchoolIds = allRes.body.map(t => (typeof t.school === 'string' ? t.school : t.school?._id));
      expect(allSchoolIds.every(id => id === schoolA.toString())).toBe(true);
    });

    it("should return 403 if scoped admin has no school", async () => {
      setUser(roles.BUSER_ADMIN, null);
      const res = await request(app).get(`/api/transactions`).expect(403);
      expect(res.body.message).toMatch(/not associated with a school/);
    });
  });

  describe("updateTransactionStatus", () => {
    let school, txnId, approver;
    beforeEach(async () => {
      school = new mongoose.Types.ObjectId();
      approver = new mongoose.Types.ObjectId();
      const txn = await BuserTransaction.create({ item: "Laptop", student: new mongoose.Types.ObjectId(), amount: 200, school, requestedBy: approver });
      txnId = txn._id.toString();
    });

    it("should update status and approvedBy within same school", async () => {
      setUser(roles.BUSER_ADMIN, school.toString());
      const res = await request(app).patch(`/api/transactions/${txnId}/status`).send({ status: 'approved' }).expect(200);
      expect(res.body.status).toBe('approved');
      expect(res.body.approvedBy).toBe(currentUser._id);
    });

    it("should return 400 for invalid status", async () => {
      setUser(roles.BUSER_ADMIN, school.toString());
      const res = await request(app).patch(`/api/transactions/${txnId}/status`).send({ status: 'invalid' }).expect(400);
      expect(res.body.message).toMatch(/Valid status/);
    });

    it("should return 403 if user has no school", async () => {
      setUser(roles.BUSER_ADMIN, null);
      await request(app).patch(`/api/transactions/${txnId}/status`).send({ status: 'approved' }).expect(403);
    });

    it("should return 404 if transaction not in user's school", async () => {
      setUser(roles.BUSER_ADMIN, new mongoose.Types.ObjectId().toString());
      await request(app).patch(`/api/transactions/${txnId}/status`).send({ status: 'approved' }).expect(404);
    });
  });

  describe("getTransactionById", () => {
    let school, owner, otherUser, txn;
    beforeEach(async () => {
      school = new mongoose.Types.ObjectId();
      owner = new mongoose.Types.ObjectId();
      otherUser = new mongoose.Types.ObjectId();
      await School.create({ _id: school, name: 'School Z' });
      await User.create({ _id: owner, name: 'Owner', email: 'owner@test.com', password: 'password', role: roles.PARENT, school })
      txn = await BuserTransaction.create({ item: "Tablet", student: new mongoose.Types.ObjectId(), amount: 120, school, requestedBy: owner });
    });

    it("should allow owner to view", async () => {
      currentUser = { _id: owner.toString(), role: roles.PARENT, school: school.toString() };
      const res = await request(app).get(`/api/transactions/${txn._id}`).expect(200);
      expect(res.body._id).toBe(txn._id.toString());
    });

    it("should allow GLOBAL_SUPER_ADMIN to view", async () => {
      setUser(roles.GLOBAL_SUPER_ADMIN, null);
      const res = await request(app).get(`/api/transactions/${txn._id}`).expect(200);
      expect(res.body._id).toBe(txn._id.toString());
    });

    it("should allow school admin of same school", async () => {
      setUser(roles.BUSER_ADMIN, school.toString());
      const res = await request(app).get(`/api/transactions/${txn._id}`).expect(200);
      expect(res.body._id).toBe(txn._id.toString());
    });

    it("should forbid unrelated user", async () => {
      currentUser = { _id: otherUser.toString(), role: roles.PARENT, school: new mongoose.Types.ObjectId().toString() };
      const res = await request(app).get(`/api/transactions/${txn._id}`).expect(403);
      expect(res.body.message).toMatch(/Forbidden/);
    });

    it("should return 404 for missing transaction", async () => {
      const res = await request(app).get(`/api/transactions/${new mongoose.Types.ObjectId()}`).expect(404);
      expect(res.body.message).toMatch(/Transaction not found/);
    });
  });

  describe("deleteTransaction", () => {
    let school, txnOtherSchool, txnSameSchool;
    beforeEach(async () => {
      school = new mongoose.Types.ObjectId();
      txnSameSchool = await BuserTransaction.create({ item: "Bag", student: new mongoose.Types.ObjectId(), amount: 20, school, requestedBy: new mongoose.Types.ObjectId() });
      txnOtherSchool = await BuserTransaction.create({ item: "Shoes", student: new mongoose.Types.ObjectId(), amount: 25, school: new mongoose.Types.ObjectId(), requestedBy: new mongoose.Types.ObjectId() });
    });

    it("should allow GLOBAL_SUPER_ADMIN to delete any transaction", async () => {
      setUser(roles.GLOBAL_SUPER_ADMIN, null);
      const res = await request(app).delete(`/api/transactions/${txnOtherSchool._id}`).expect(200);
      expect(res.body.message).toMatch(/deleted successfully/);
    });

    it("should restrict non-global admin to their school", async () => {
      setUser(roles.BUSER_ADMIN, school.toString());
      // Deleting other school should 404
      await request(app).delete(`/api/transactions/${txnOtherSchool._id}`).expect(404);
      // Deleting same school should work
      const res = await request(app).delete(`/api/transactions/${txnSameSchool._id}`).expect(200);
      expect(res.body.message).toMatch(/deleted successfully/);
    });

    it("should return 403 if non-global admin has no school set", async () => {
      setUser(roles.BUSER_ADMIN, null);
      await request(app).delete(`/api/transactions/${txnSameSchool._id}`).expect(403);
    });
  });
});

afterEach(async () => {
  // Clean up transactions between tests where we use real DB writes
  await BuserTransaction.deleteMany({});
  await User.deleteMany({});
  await School.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
