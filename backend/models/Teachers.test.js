import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Teacher from "./Teachers.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-teacher' },
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

describe("Teacher Model", () => {
    // Mock ObjectIds for testing
    const mockUserId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create a teacher with required fields", async () => {
            const teacherData = {
                user: mockUserId
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.user.toString()).toBe(mockUserId.toString());
            expect(savedTeacher.subjects).toEqual([]);
        });

        it("should create a teacher with subjects", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Mathematics", "Physics", "Chemistry"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.user.toString()).toBe(mockUserId.toString());
            expect(savedTeacher.subjects).toEqual(["Mathematics", "Physics", "Chemistry"]);
        });

        it("should handle empty subjects array", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: []
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.subjects).toEqual([]);
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create teacher without user", async () => {
            const teacherData = {
                subjects: ["Mathematics"]
            };

            const teacher = new Teacher(teacherData);
            await expect(teacher.save()).rejects.toThrow(/user.*required/i);
        });
    });

    describe("Field Validation", () => {
        it("should accept string subjects", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["English", "History", "Geography"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.subjects).toEqual(["English", "History", "Geography"]);
        });

        it("should accept single subject", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Computer Science"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.subjects).toEqual(["Computer Science"]);
        });

        it("should handle duplicate subjects", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Mathematics", "Mathematics", "Physics"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.subjects).toEqual(["Mathematics", "Mathematics", "Physics"]);
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Biology"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.createdAt).toBeInstanceOf(Date);
            expect(savedTeacher.updatedAt).toBeInstanceOf(Date);
            expect(savedTeacher.updatedAt.getTime()).toBeGreaterThanOrEqual(savedTeacher.createdAt.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Chemistry"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();
            const originalUpdatedAt = savedTeacher.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedTeacher.subjects.push("Organic Chemistry");
            await savedTeacher.save();

            expect(savedTeacher.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Default Values", () => {
        it("should default subjects to empty array when not provided", async () => {
            const teacherData = {
                user: mockUserId
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.subjects).toEqual([]);
        });
    });

    describe("Data Types", () => {
        it("should store subjects as strings", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Math", "Science", "Arts"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(typeof savedTeacher.subjects[0]).toBe("string");
            expect(typeof savedTeacher.subjects[1]).toBe("string");
            expect(typeof savedTeacher.subjects[2]).toBe("string");
        });

        it("should handle subjects with special characters", async () => {
            const teacherData = {
                user: mockUserId,
                subjects: ["Mathematics & Statistics", "Physics/Chemistry", "English Literature-Drama"]
            };

            const teacher = new Teacher(teacherData);
            const savedTeacher = await teacher.save();

            expect(savedTeacher.subjects).toEqual(["Mathematics & Statistics", "Physics/Chemistry", "English Literature-Drama"]);
        });
    });
});
