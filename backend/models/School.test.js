import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import School from "./School.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-school' },
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

describe("School Model", () => {
    describe("Schema Validation", () => {
        it("should create a school with required fields", async () => {
            const schoolData = {
                name: "Test School"
            };

            const school = new School(schoolData);
            const savedSchool = await school.save();

            expect(savedSchool.name).toBe("Test School");
            expect(savedSchool.isActive).toBe(true);
            expect(savedSchool.features).toBeInstanceOf(Map);
            expect(savedSchool.notifiedMilestones).toEqual([]);
            expect(savedSchool.createdAt).toBeDefined();
            expect(savedSchool.updatedAt).toBeDefined();
        });

        it("should fail to create a school without required name field", async () => {
            const school = new School({});

            await expect(school.save()).rejects.toThrow(/validation failed/i);
        });

        it("should create a school with all optional fields", async () => {
            const schoolData = {
                name: "Complete School",
                address: "123 Main St, City, State",
                phone: "+1-555-0123",
                lat: 40.7128,
                lng: -74.0060,
                mainSuperAdmins: [new mongoose.Types.ObjectId()],
                students: [new mongoose.Types.ObjectId()],
                isActive: false,
                features: new Map([["feature1", true], ["feature2", false]]),
                notifiedMilestones: [100, 500, 1000]
            };

            const school = new School(schoolData);
            const savedSchool = await school.save();

            expect(savedSchool.name).toBe("Complete School");
            expect(savedSchool.address).toBe("123 Main St, City, State");
            expect(savedSchool.phone).toBe("+1-555-0123");
            expect(savedSchool.lat).toBe(40.7128);
            expect(savedSchool.lng).toBe(-74.0060);
            expect(savedSchool.mainSuperAdmins).toHaveLength(1);
            expect(savedSchool.students).toHaveLength(1);
            expect(savedSchool.isActive).toBe(false);
            expect(savedSchool.features.get("feature1")).toBe(true);
            expect(savedSchool.features.get("feature2")).toBe(false);
            expect(savedSchool.notifiedMilestones).toEqual([100, 500, 1000]);
        });
    });

    describe("Field Types and Constraints", () => {
        it("should handle string fields correctly", async () => {
            const school = new School({
                name: "String School",
                address: "String Address",
                phone: "String Phone"
            });

            const savedSchool = await school.save();
            expect(typeof savedSchool.name).toBe("string");
            expect(typeof savedSchool.address).toBe("string");
            expect(typeof savedSchool.phone).toBe("string");
        });

        it("should handle number fields correctly", async () => {
            const school = new School({
                name: "Number School",
                lat: 37.7749,
                lng: -122.4194
            });

            const savedSchool = await school.save();
            expect(typeof savedSchool.lat).toBe("number");
            expect(typeof savedSchool.lng).toBe("number");
        });

        it("should handle boolean fields correctly", async () => {
            const school = new School({
                name: "Boolean School",
                isActive: false
            });

            const savedSchool = await school.save();
            expect(typeof savedSchool.isActive).toBe("boolean");
            expect(savedSchool.isActive).toBe(false);
        });

        it("should handle array fields correctly", async () => {
            const adminId = new mongoose.Types.ObjectId();
            const studentId = new mongoose.Types.ObjectId();

            const school = new School({
                name: "Array School",
                mainSuperAdmins: [adminId],
                students: [studentId],
                notifiedMilestones: [100, 200]
            });

            const savedSchool = await school.save();
            expect(Array.isArray(savedSchool.mainSuperAdmins)).toBe(true);
            expect(Array.isArray(savedSchool.students)).toBe(true);
            expect(Array.isArray(savedSchool.notifiedMilestones)).toBe(true);
            expect(savedSchool.mainSuperAdmins[0]).toEqual(adminId);
            expect(savedSchool.students[0]).toEqual(studentId);
            expect(savedSchool.notifiedMilestones).toEqual([100, 200]);
        });

        it("should handle Map fields correctly", async () => {
            const features = new Map([
                ["exams", true],
                ["reports", false],
                ["analytics", true]
            ]);

            const school = new School({
                name: "Map School",
                features
            });

            const savedSchool = await school.save();
            expect(savedSchool.features).toBeInstanceOf(Map);
            expect(savedSchool.features.get("exams")).toBe(true);
            expect(savedSchool.features.get("reports")).toBe(false);
            expect(savedSchool.features.get("analytics")).toBe(true);
        });
    });

    describe("Default Values", () => {
        it("should set default values correctly", async () => {
            const school = new School({
                name: "Default School"
            });

            const savedSchool = await school.save();

            expect(savedSchool.isActive).toBe(true);
            expect(savedSchool.features).toBeInstanceOf(Map);
            expect(savedSchool.features.size).toBe(0);
            expect(savedSchool.notifiedMilestones).toEqual([]);
            expect(savedSchool.address).toBeUndefined();
            expect(savedSchool.phone).toBeUndefined();
            expect(savedSchool.lat).toBeUndefined();
            expect(savedSchool.lng).toBeUndefined();
            expect(savedSchool.mainSuperAdmins).toEqual([]);
            expect(savedSchool.students).toEqual([]);
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const beforeCreate = new Date();

            const school = new School({
                name: "Timestamp School"
            });

            const savedSchool = await school.save();
            const afterCreate = new Date();

            expect(savedSchool.createdAt).toBeDefined();
            expect(savedSchool.updatedAt).toBeDefined();
            expect(savedSchool.createdAt).toBeInstanceOf(Date);
            expect(savedSchool.updatedAt).toBeInstanceOf(Date);
            expect(savedSchool.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedSchool.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt on save", async () => {
            const school = new School({
                name: "Update School"
            });

            const savedSchool = await school.save();
            const firstUpdate = savedSchool.updatedAt;

            // Wait a bit and update
            await new Promise(resolve => setTimeout(resolve, 10));
            savedSchool.address = "Updated Address";
            const updatedSchool = await savedSchool.save();

            expect(updatedSchool.updatedAt.getTime()).toBeGreaterThan(firstUpdate.getTime());
        });
    });

    describe("Model Methods", () => {
        it("should have proper model name", () => {
            expect(School.modelName).toBe("School");
        });

        it("should be able to find schools", async () => {
            await School.create({ name: "Find School 1" });
            await School.create({ name: "Find School 2" });

            const schools = await School.find();
            expect(schools.length).toBe(2);
            expect(schools[0].name).toBe("Find School 1");
            expect(schools[1].name).toBe("Find School 2");
        });

        it("should be able to find school by id", async () => {
            const school = await School.create({ name: "Find By ID School" });
            const foundSchool = await School.findById(school._id);

            expect(foundSchool).toBeTruthy();
            expect(foundSchool.name).toBe("Find By ID School");
        });

        it("should be able to update school", async () => {
            const school = await School.create({ name: "Update School" });
            const updatedSchool = await School.findByIdAndUpdate(
                school._id,
                { name: "Updated School Name" },
                { new: true }
            );

            expect(updatedSchool.name).toBe("Updated School Name");
        });

        it("should be able to delete school", async () => {
            const school = await School.create({ name: "Delete School" });
            await School.findByIdAndDelete(school._id);

            const deletedSchool = await School.findById(school._id);
            expect(deletedSchool).toBeNull();
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty strings for optional fields", async () => {
            const school = new School({
                name: "Edge Case School",
                address: "",
                phone: ""
            });

            const savedSchool = await school.save();
            expect(savedSchool.address).toBe("");
            expect(savedSchool.phone).toBe("");
        });

        it("should handle zero values for coordinates", async () => {
            const school = new School({
                name: "Zero Coordinate School",
                lat: 0,
                lng: 0
            });

            const savedSchool = await school.save();
            expect(savedSchool.lat).toBe(0);
            expect(savedSchool.lng).toBe(0);
        });

        it("should handle negative coordinate values", async () => {
            const school = new School({
                name: "Negative Coordinate School",
                lat: -33.8688,
                lng: 151.2093
            });

            const savedSchool = await school.save();
            expect(savedSchool.lat).toBe(-33.8688);
            expect(savedSchool.lng).toBe(151.2093);
        });

        it("should handle large milestone numbers", async () => {
            const school = new School({
                name: "Large Milestone School",
                notifiedMilestones: [1000, 10000, 100000]
            });

            const savedSchool = await school.save();
            expect(savedSchool.notifiedMilestones).toEqual([1000, 10000, 100000]);
        });
    });
});
