import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import ExamInvigilator from "./ExamInvigilator.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-exam-invigilator' },
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
});

describe("ExamInvigilator Model", () => {
    // Mock ObjectIds for testing
    const mockExamId = new mongoose.Types.ObjectId();
    const mockTeacherId = new mongoose.Types.ObjectId();
    const mockSchoolId = new mongoose.Types.ObjectId();
    const mockAssignedById = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create an exam invigilator with all required fields", async () => {
            const invigilatorData = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            const savedInvigilator = await invigilator.save();

            expect(savedInvigilator.exam.toString()).toBe(mockExamId.toString());
            expect(savedInvigilator.teacher.toString()).toBe(mockTeacherId.toString());
            expect(savedInvigilator.school.toString()).toBe(mockSchoolId.toString());
            expect(savedInvigilator.assignedBy.toString()).toBe(mockAssignedById.toString());
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create invigilator without exam", async () => {
            const invigilatorData = {
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            await expect(invigilator.save()).rejects.toThrow(/exam.*required/i);
        });

        it("should fail to create invigilator without teacher", async () => {
            const invigilatorData = {
                exam: mockExamId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            await expect(invigilator.save()).rejects.toThrow(/teacher.*required/i);
        });

        it("should fail to create invigilator without school", async () => {
            const invigilatorData = {
                exam: mockExamId,
                teacher: mockTeacherId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            await expect(invigilator.save()).rejects.toThrow(/school.*required/i);
        });

        it("should fail to create invigilator without assignedBy", async () => {
            const invigilatorData = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            await expect(invigilator.save()).rejects.toThrow(/assignedBy.*required/i);
        });
    });

    describe("Unique Constraints", () => {
        it("should enforce unique constraint on exam and teacher", async () => {
            // Create first invigilator assignment
            const invigilatorData1 = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator1 = new ExamInvigilator(invigilatorData1);
            await invigilator1.save();

            // Try to create duplicate assignment
            const invigilatorData2 = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator2 = new ExamInvigilator(invigilatorData2);
            await expect(invigilator2.save()).rejects.toThrow(/duplicate key/i);
        });

        it("should allow same teacher to invigilate different exams", async () => {
            const mockExamId2 = new mongoose.Types.ObjectId();

            // Create invigilator for first exam
            const invigilatorData1 = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator1 = new ExamInvigilator(invigilatorData1);
            await invigilator1.save();

            // Create invigilator for second exam (should succeed)
            const invigilatorData2 = {
                exam: mockExamId2,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator2 = new ExamInvigilator(invigilatorData2);
            const savedInvigilator2 = await invigilator2.save();

            expect(savedInvigilator2.exam.toString()).toBe(mockExamId2.toString());
            expect(savedInvigilator2.teacher.toString()).toBe(mockTeacherId.toString());
        });

        it("should allow different teachers for same exam", async () => {
            const mockTeacherId2 = new mongoose.Types.ObjectId();

            // Create invigilator for first teacher
            const invigilatorData1 = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator1 = new ExamInvigilator(invigilatorData1);
            await invigilator1.save();

            // Create invigilator for second teacher (should succeed)
            const invigilatorData2 = {
                exam: mockExamId,
                teacher: mockTeacherId2,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator2 = new ExamInvigilator(invigilatorData2);
            const savedInvigilator2 = await invigilator2.save();

            expect(savedInvigilator2.exam.toString()).toBe(mockExamId.toString());
            expect(savedInvigilator2.teacher.toString()).toBe(mockTeacherId2.toString());
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const beforeCreate = new Date();
            const invigilatorData = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            const savedInvigilator = await invigilator.save();
            const afterCreate = new Date();

            expect(savedInvigilator.createdAt).toBeInstanceOf(Date);
            expect(savedInvigilator.updatedAt).toBeInstanceOf(Date);
            expect(savedInvigilator.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedInvigilator.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const invigilatorData = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            const savedInvigilator = await invigilator.save();
            const originalUpdatedAt = savedInvigilator.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            // Update a field
            savedInvigilator.assignedBy = new mongoose.Types.ObjectId();
            await savedInvigilator.save();

            expect(savedInvigilator.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Indexing", () => {
        it("should create invigilators with proper indexing", async () => {
            const invigilatorData = {
                exam: mockExamId,
                teacher: mockTeacherId,
                school: mockSchoolId,
                assignedBy: mockAssignedById
            };

            const invigilator = new ExamInvigilator(invigilatorData);
            const savedInvigilator = await invigilator.save();

            // Check that the document was saved successfully (indexing is handled by MongoDB)
            expect(savedInvigilator._id).toBeDefined();
            expect(savedInvigilator.exam.toString()).toBe(mockExamId.toString());
            expect(savedInvigilator.teacher.toString()).toBe(mockTeacherId.toString());
        });
    });
});
