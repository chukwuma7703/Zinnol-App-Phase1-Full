import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Subject from "./Subject.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-subject' },
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

describe("Subject Model", () => {
    // Mock ObjectIds for testing
    const mockSchoolId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create a subject with all required fields", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "Mathematics",
                code: "MATH"
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();

            expect(savedSubject.school.toString()).toBe(mockSchoolId.toString());
            expect(savedSubject.name).toBe("Mathematics");
            expect(savedSubject.code).toBe("MATH");
            expect(savedSubject.stageScope).toEqual(["BASIC", "JSS", "SSS"]);
            expect(savedSubject.maxMark).toBe(100);
        });

        it("should create a subject with custom values", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "English Language",
                code: "eng",
                stageScope: ["KG", "BASIC"],
                maxMark: 80
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();

            expect(savedSubject.name).toBe("English Language");
            expect(savedSubject.code).toBe("ENG"); // Should be uppercased
            expect(savedSubject.stageScope).toEqual(["KG", "BASIC"]);
            expect(savedSubject.maxMark).toBe(80);
        });

        it("should trim name and code", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "  Physics  ",
                code: " phy "
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();

            expect(savedSubject.name).toBe("Physics");
            expect(savedSubject.code).toBe("PHY");
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create subject without school", async () => {
            const subjectData = {
                name: "Chemistry",
                code: "CHEM"
            };

            const subject = new Subject(subjectData);
            await expect(subject.save()).rejects.toThrow(/school.*required/i);
        });

        it("should fail to create subject without name", async () => {
            const subjectData = {
                school: mockSchoolId,
                code: "CHEM"
            };

            const subject = new Subject(subjectData);
            await expect(subject.save()).rejects.toThrow(/name.*required/i);
        });

        it("should fail to create subject without code", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "Chemistry"
            };

            const subject = new Subject(subjectData);
            await expect(subject.save()).rejects.toThrow(/code.*required/i);
        });
    });

    describe("Field Validation", () => {
        it("should accept valid stageScope values", async () => {
            const validScopes = [
                ["KG"],
                ["BASIC"],
                ["JSS"],
                ["SSS"],
                ["KG", "BASIC"],
                ["BASIC", "JSS", "SSS"]
            ];

            for (const scope of validScopes) {
                const subjectData = {
                    school: mockSchoolId,
                    name: "Test Subject",
                    code: `TEST${scope.join("")}`,
                    stageScope: scope
                };

                const subject = new Subject(subjectData);
                const savedSubject = await subject.save();
                expect(savedSubject.stageScope).toEqual(scope);
            }
        });

        it("should reject invalid stageScope values", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "Test Subject",
                code: "TEST",
                stageScope: ["INVALID"]
            };

            const subject = new Subject(subjectData);
            await expect(subject.save()).rejects.toThrow();
        });

        it("should accept valid maxMark range", async () => {
            const validMarks = [1, 50, 100];

            for (const mark of validMarks) {
                const subjectData = {
                    school: mockSchoolId,
                    name: "Test Subject",
                    code: `TEST${mark}`,
                    maxMark: mark
                };

                const subject = new Subject(subjectData);
                const savedSubject = await subject.save();
                expect(savedSubject.maxMark).toBe(mark);
            }
        });

        it("should reject invalid maxMark values", async () => {
            const invalidMarks = [0, 101, -1];

            for (const mark of invalidMarks) {
                const subjectData = {
                    school: mockSchoolId,
                    name: "Test Subject",
                    code: `TEST${mark}`,
                    maxMark: mark
                };

                const subject = new Subject(subjectData);
                await expect(subject.save()).rejects.toThrow();
            }
        });
    });

    describe("Unique Constraints", () => {
        it("should enforce unique constraint on school and code", async () => {
            // Create first subject
            const subjectData1 = {
                school: mockSchoolId,
                name: "Mathematics",
                code: "MATH"
            };

            const subject1 = new Subject(subjectData1);
            await subject1.save();

            // Try to create duplicate
            const subjectData2 = {
                school: mockSchoolId,
                name: "Advanced Mathematics",
                code: "MATH"
            };

            const subject2 = new Subject(subjectData2);
            await expect(subject2.save()).rejects.toThrow(/duplicate key/i);
        });

        it("should allow same code in different schools", async () => {
            const mockSchoolId2 = new mongoose.Types.ObjectId();

            // Create subject in first school
            const subjectData1 = {
                school: mockSchoolId,
                name: "Mathematics",
                code: "MATH"
            };

            const subject1 = new Subject(subjectData1);
            await subject1.save();

            // Create same code in different school
            const subjectData2 = {
                school: mockSchoolId2,
                name: "Mathematics",
                code: "MATH"
            };

            const subject2 = new Subject(subjectData2);
            const savedSubject2 = await subject2.save();
            expect(savedSubject2.code).toBe("MATH");
            expect(savedSubject2.school.toString()).toBe(mockSchoolId2.toString());
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "History",
                code: "HIST"
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();

            expect(savedSubject.createdAt).toBeInstanceOf(Date);
            expect(savedSubject.updatedAt).toBeInstanceOf(Date);
            expect(savedSubject.updatedAt.getTime()).toBeGreaterThanOrEqual(savedSubject.createdAt.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "Geography",
                code: "GEO"
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();
            const originalUpdatedAt = savedSubject.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedSubject.maxMark = 90;
            await savedSubject.save();

            expect(savedSubject.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Default Values", () => {
        it("should set default stageScope", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "Computer Science",
                code: "CS"
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();

            expect(savedSubject.stageScope).toEqual(["BASIC", "JSS", "SSS"]);
        });

        it("should set default maxMark", async () => {
            const subjectData = {
                school: mockSchoolId,
                name: "Art",
                code: "ART"
            };

            const subject = new Subject(subjectData);
            const savedSubject = await subject.save();

            expect(savedSubject.maxMark).toBe(100);
        });
    });
});
