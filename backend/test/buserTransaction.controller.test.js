import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import dotenv from "dotenv";

import app from "../server.js";
import BuserTransaction from "../models/BuserTransaction.js";
import Student from "../models/Student.js";
import User from "../models/userModel.js";
import School from "../models/School.js";
import { roles } from "../config/roles.js";
import { generateAccessToken } from "../utils/generateToken.js";

describe("Buser Transaction Controller API", () => {
    let mongoServer;
    let globalAdmin, schoolAdmin, teacher;
    let globalAdminToken, schoolAdminToken, teacherToken;
    let school1, student1;

    beforeAll(async () => {
        // Load environment variables
        dotenv.config({ path: '../zinnol.env' });
        // Set JWT_EXPIRE explicitly if not loaded
        process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30m';
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        await mongoose.connect(mongoUri);        // Create test school
        school1 = await School.create({
            name: "Test School 1",
            address: "123 Test St",
            phone: "123-456-7890",
            email: "test@school.com"
        });

        // Create test users
        globalAdmin = await User.create({
            name: "Global Admin",
            email: "global@admin.com",
            password: "password123",
            role: roles.GLOBAL_SUPER_ADMIN
        });

        schoolAdmin = await User.create({
            name: "School Admin",
            email: "school@admin.com",
            password: "password123",
            role: roles.BUSER_ADMIN,
            school: school1._id
        });

        teacher = await User.create({
            name: "Teacher",
            email: "teacher@test.com",
            password: "password123",
            role: roles.TEACHER,
            school: school1._id
        });

        // Create test classroom
        const classroom1 = await mongoose.model('Classroom').create({
            school: school1._id,
            stage: "jss",
            level: 1,
            section: "A",
            teacher: teacher._id
        });

        // Create test student
        student1 = await Student.create({
            school: school1._id,
            classroom: classroom1._id,
            admissionNumber: "STU001",
            firstName: "Test",
            lastName: "Student",
            gender: "Male",
            email: "student@test.com"
        });

        // Generate tokens
        globalAdminToken = generateAccessToken(globalAdmin, '30m');
        schoolAdminToken = generateAccessToken(schoolAdmin, '30m');
        teacherToken = generateAccessToken(teacher, '30m');
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        // Clear transactions before each test
        await BuserTransaction.deleteMany({});
    });

    describe("POST /api/buser-transactions", () => {
        it("should create a transaction successfully as school admin", async () => {
            const transactionData = {
                item: "Laptop",
                student: student1._id.toString(),
                parent: "parent123",
                amount: 500
            };

            const response = await request(app)
                .post("/api/buser-transactions")
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send(transactionData);

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                item: "Laptop",
                student: student1._id.toString(),
                amount: 500,
                school: school1._id.toString(),
                requestedBy: schoolAdmin._id.toString()
            });
        });

        it("should return 400 if required fields are missing", async () => {
            const incompleteData = { item: "Laptop" };

            const response = await request(app)
                .post("/api/buser-transactions")
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send(incompleteData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Item, student ID, and amount are required");
        });

        it("should return 400 if amount is not positive", async () => {
            const invalidData = {
                item: "Laptop",
                student: student1._id.toString(),
                amount: -100
            };

            const response = await request(app)
                .post("/api/buser-transactions")
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send(invalidData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Amount must be greater than 0");
        });

        it("should return 404 if student not found in user's school", async () => {
            // Create another school and classroom
            const school2 = await School.create({
                name: "Test School 2",
                address: "456 Test St",
                phone: "987-654-3210",
                email: "test2@school.com"
            });

            const classroom2 = await mongoose.model('Classroom').create({
                name: "Class 10B",
                school: school2._id,
                stage: "jss",
                level: 1,
                section: "B",
                teacher: teacher._id
            });

            const student2 = await Student.create({
                school: school2._id,
                classroom: classroom2._id,
                admissionNumber: "STU002",
                firstName: "Other",
                lastName: "Student",
                gender: "Female",
                email: "student2@test.com"
            });

            const transactionData = {
                item: "Laptop",
                student: student2._id.toString(), // Student from different school
                amount: 500
            };

            const response = await request(app)
                .post("/api/buser-transactions")
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send(transactionData);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Student not found in your school.");
        });
    });

    describe("GET /api/buser-transactions", () => {
        beforeEach(async () => {
            // Create test transactions
            await BuserTransaction.create([
                {
                    item: "Laptop",
                    student: student1._id,
                    school: school1._id,
                    requestedBy: schoolAdmin._id,
                    amount: 500,
                    status: "pending"
                },
                {
                    item: "Book",
                    student: student1._id,
                    school: school1._id,
                    requestedBy: schoolAdmin._id,
                    amount: 50,
                    status: "approved"
                }
            ]);
        });

        it("should return transactions for school admin", async () => {
            const response = await request(app)
                .get("/api/buser-transactions")
                .set("Authorization", `Bearer ${schoolAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body.every(t => t.school === school1._id.toString())).toBe(true);
        });

        it("should return all transactions for global admin", async () => {
            const response = await request(app)
                .get("/api/buser-transactions")
                .set("Authorization", `Bearer ${globalAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
        });

        it("should filter transactions by status", async () => {
            const response = await request(app)
                .get("/api/buser-transactions?status=approved")
                .set("Authorization", `Bearer ${schoolAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].status).toBe("approved");
        });
    });

    describe("PUT /api/buser-transactions/:id/status", () => {
        let transaction;

        beforeEach(async () => {
            transaction = await BuserTransaction.create({
                item: "Laptop",
                student: student1._id,
                school: school1._id,
                requestedBy: schoolAdmin._id,
                amount: 500,
                status: "pending"
            });
        });

        it("should update transaction status successfully", async () => {
            const response = await request(app)
                .put(`/api/buser-transactions/${transaction._id}/status`)
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send({ status: "approved" });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe("approved");
            expect(response.body.approvedBy).toBe(schoolAdmin._id.toString());
        });

        it("should return 400 for invalid status", async () => {
            const response = await request(app)
                .put(`/api/buser-transactions/${transaction._id}/status`)
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send({ status: "invalid_status" });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Valid status (approved, declined, or paid) is required");
        });

        it("should return 404 if transaction not found in user's school", async () => {
            // Create another school and transaction
            const school2 = await School.create({
                name: "Test School 2",
                address: "456 Test St",
                phone: "987-654-3210",
                email: "test2@school.com"
            });

            const transaction2 = await BuserTransaction.create({
                item: "Book",
                student: student1._id,
                school: school2._id,
                requestedBy: schoolAdmin._id,
                amount: 100,
                status: "pending"
            });

            const response = await request(app)
                .put(`/api/buser-transactions/${transaction2._id}/status`)
                .set("Authorization", `Bearer ${schoolAdminToken}`)
                .send({ status: "approved" });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Transaction not found in your school.");
        });
    });

    describe("GET /api/buser-transactions/:id", () => {
        let transaction;

        beforeEach(async () => {
            transaction = await BuserTransaction.create({
                item: "Laptop",
                student: student1._id,
                school: school1._id,
                requestedBy: schoolAdmin._id,
                amount: 500,
                status: "pending"
            });
        });

        it("should return transaction for school admin", async () => {
            const response = await request(app)
                .get(`/api/buser-transactions/${transaction._id}`)
                .set("Authorization", `Bearer ${schoolAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body._id).toBe(transaction._id.toString());
            expect(response.body.school).toBe(school1._id.toString());
        });

        it("should return transaction for global admin from any school", async () => {
            const response = await request(app)
                .get(`/api/buser-transactions/${transaction._id}`)
                .set("Authorization", `Bearer ${globalAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body._id).toBe(transaction._id.toString());
        });

        it("should return 404 if transaction not found", async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .get(`/api/buser-transactions/${fakeId}`)
                .set("Authorization", `Bearer ${schoolAdminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Transaction not found or you do not have permission to view it.");
        });
    });

    describe("DELETE /api/buser-transactions/:id", () => {
        let transaction;

        beforeEach(async () => {
            transaction = await BuserTransaction.create({
                item: "Laptop",
                student: student1._id,
                school: school1._id,
                requestedBy: schoolAdmin._id,
                amount: 500,
                status: "pending"
            });
        });

        it("should delete transaction successfully", async () => {
            const response = await request(app)
                .delete(`/api/buser-transactions/${transaction._id}`)
                .set("Authorization", `Bearer ${schoolAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Transaction deleted successfully");

            // Verify transaction is deleted
            const deletedTransaction = await BuserTransaction.findById(transaction._id);
            expect(deletedTransaction).toBeNull();
        });

        it("should return 404 if transaction not found", async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const response = await request(app)
                .delete(`/api/buser-transactions/${fakeId}`)
                .set("Authorization", `Bearer ${schoolAdminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Transaction not found or you do not have permission to delete it.");
        });
    });
});
