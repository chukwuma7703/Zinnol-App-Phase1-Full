import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Classroom from "./Classroom.js";
import Student from "./Student.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-classroom' },
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

describe("Classroom Model", () => {
    // Mock ObjectIds for testing
    const mockSchoolId = new mongoose.Types.ObjectId();
    const mockTeacherId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create a classroom with all required fields", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 3,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.school.toString()).toBe(mockSchoolId.toString());
            expect(savedClassroom.stage).toBe("basic");
            expect(savedClassroom.level).toBe(3);
            expect(savedClassroom.stream).toBe("general");
            expect(savedClassroom.section).toBe("A");
            expect(savedClassroom.label).toBe("Basic 3A");
            expect(savedClassroom.teacher.toString()).toBe(mockTeacherId.toString());
            expect(savedClassroom.capacity).toBe(250); // Default for basic stage
            expect(savedClassroom.studentCount).toBe(0);
            expect(savedClassroom.isActive).toBe(true);
            expect(savedClassroom.createdAt).toBeDefined();
            expect(savedClassroom.updatedAt).toBeDefined();
        });

        it("should create a classroom with custom values", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "sss",
                level: 2,
                stream: "science",
                section: "B",
                label: "Science Class 2B",
                teacher: mockTeacherId,
                capacity: 35,
                studentCount: 28,
                isActive: false
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.stage).toBe("sss");
            expect(savedClassroom.level).toBe(2);
            expect(savedClassroom.stream).toBe("science");
            expect(savedClassroom.section).toBe("B");
            expect(savedClassroom.label).toBe("Science Class 2B");
            expect(savedClassroom.capacity).toBe(35);
            expect(savedClassroom.studentCount).toBe(28);
            expect(savedClassroom.isActive).toBe(false);
        });

        it("should auto-generate label when not provided", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "jss",
                level: 1,
                section: "C",
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.label).toBe("J.S.S 1C");
        });

        it("should trim and uppercase section", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 4,
                section: "  b  ",
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.section).toBe("B");
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create classroom without school", async () => {
            const classroomData = {
                stage: "basic",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            await expect(classroom.save()).rejects.toThrow(/school.*required/i);
        });

        it("should fail to create classroom without stage", async () => {
            const classroomData = {
                school: mockSchoolId,
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            await expect(classroom.save()).rejects.toThrow(/stage.*required/i);
        });

        it("should fail to create classroom without level", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            await expect(classroom.save()).rejects.toThrow(/level.*required/i);
        });

        it("should fail to create classroom without teacher", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1
            };

            const classroom = new Classroom(classroomData);
            await expect(classroom.save()).rejects.toThrow(/A class teacher must be assigned/i);
        });
    });

    describe("Stage and Level Validation", () => {
        it("should accept valid stage values", async () => {
            const stages = ["creche", "kg", "basic", "jss", "sss"];

            for (const stage of stages) {
                const classroomData = {
                    school: mockSchoolId,
                    stage,
                    level: 1,
                    teacher: mockTeacherId
                };

                const classroom = new Classroom(classroomData);
                const savedClassroom = await classroom.save();
                expect(savedClassroom.stage).toBe(stage);
            }
        });

        it("should reject invalid stage values", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "invalid",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            await expect(classroom.save()).rejects.toThrow();
        });

        it("should accept valid level ranges for each stage", async () => {
            const testCases = [
                { stage: "creche", level: 1 },
                { stage: "kg", level: 1 },
                { stage: "kg", level: 2 },
                { stage: "kg", level: 3 },
                { stage: "basic", level: 1 },
                { stage: "basic", level: 6 },
                { stage: "jss", level: 1 },
                { stage: "jss", level: 3 },
                { stage: "sss", level: 1 },
                { stage: "sss", level: 3 }
            ];

            for (const testCase of testCases) {
                const classroomData = {
                    school: mockSchoolId,
                    ...testCase,
                    teacher: mockTeacherId
                };

                const classroom = new Classroom(classroomData);
                const savedClassroom = await classroom.save();
                expect(savedClassroom.stage).toBe(testCase.stage);
                expect(savedClassroom.level).toBe(testCase.level);
            }
        });

        it("should reject invalid level ranges", async () => {
            const testCases = [
                { stage: "kg", level: 0, error: "KG level must be between 1 and 3" },
                { stage: "kg", level: 4, error: "KG level must be between 1 and 3" },
                { stage: "basic", level: 0, error: "Basic level must be between 1 and 6" },
                { stage: "basic", level: 7, error: "Basic level must be between 1 and 6" },
                { stage: "jss", level: 0, error: "JSS level must be between 1 and 3" },
                { stage: "jss", level: 4, error: "JSS level must be between 1 and 3" },
                { stage: "sss", level: 0, error: "SSS level must be between 1 and 3" },
                { stage: "sss", level: 4, error: "SSS level must be between 1 and 3" }
            ];

            for (const testCase of testCases) {
                const classroomData = {
                    school: mockSchoolId,
                    stage: testCase.stage,
                    level: testCase.level,
                    teacher: mockTeacherId
                };

                const classroom = new Classroom(classroomData);
                await expect(classroom.save()).rejects.toThrow(testCase.error);
            }
        });
    });

    describe("Stream Validation", () => {
        it("should accept valid stream values", async () => {
            const streams = ["science", "arts", "commercial", "general"];

            for (let i = 0; i < streams.length; i++) {
                const classroomData = {
                    school: mockSchoolId,
                    stage: "sss",
                    level: 1,
                    section: String.fromCharCode(65 + i), // A, B, C, D
                    stream: streams[i],
                    teacher: mockTeacherId
                };

                const classroom = new Classroom(classroomData);
                const savedClassroom = await classroom.save();
                expect(savedClassroom.stream).toBe(streams[i]);
            }
        });

        it("should reject invalid stream values", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "sss",
                level: 1,
                stream: "invalid",
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            await expect(classroom.save()).rejects.toThrow();
        });

        it("should default to 'general' stream", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();
            expect(savedClassroom.stream).toBe("general");
        });
    });

    describe("Capacity Defaults", () => {
        it("should set correct default capacity for each stage", async () => {
            const testCases = [
                { stage: "creche", expectedCapacity: 50 },
                { stage: "kg", expectedCapacity: 200 },
                { stage: "basic", expectedCapacity: 250 },
                { stage: "jss", expectedCapacity: 300 },
                { stage: "sss", expectedCapacity: 300 }
            ];

            for (const testCase of testCases) {
                const classroomData = {
                    school: mockSchoolId,
                    stage: testCase.stage,
                    level: 1,
                    teacher: mockTeacherId
                };

                const classroom = new Classroom(classroomData);
                const savedClassroom = await classroom.save();
                expect(savedClassroom.capacity).toBe(testCase.expectedCapacity);
            }
        });

        it("should allow custom capacity override", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                capacity: 150,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();
            expect(savedClassroom.capacity).toBe(150);
        });
    });

    describe("Virtual Properties", () => {
        it("should calculate remainingSeats correctly", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                capacity: 30,
                studentCount: 25,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.remainingSeats).toBe(5);
        });

        it("should return 0 when studentCount exceeds capacity", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                capacity: 20,
                studentCount: 25,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.remainingSeats).toBe(0);
        });

        it("should return null when capacity is not set", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                capacity: null,
                studentCount: 10,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.remainingSeats).toBe(null);
        });
    });

    describe("Unique Constraints", () => {
        it("should enforce unique constraint on school, stage, level, section", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 2,
                section: "A",
                teacher: mockTeacherId
            };

            // Create first classroom
            const classroom1 = new Classroom(classroomData);
            await classroom1.save();

            // Try to create duplicate
            const classroom2 = new Classroom(classroomData);
            await expect(classroom2.save()).rejects.toThrow(/duplicate key/i);
        });

        it("should allow same stage/level/section in different schools", async () => {
            const school2Id = new mongoose.Types.ObjectId();

            const classroomData1 = {
                school: mockSchoolId,
                stage: "basic",
                level: 2,
                section: "A",
                teacher: mockTeacherId
            };

            const classroomData2 = {
                school: school2Id,
                stage: "basic",
                level: 2,
                section: "A",
                teacher: mockTeacherId
            };

            const classroom1 = new Classroom(classroomData1);
            const classroom2 = new Classroom(classroomData2);

            await expect(classroom1.save()).resolves.toBeDefined();
            await expect(classroom2.save()).resolves.toBeDefined();
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            expect(savedClassroom.createdAt).toBeDefined();
            expect(savedClassroom.updatedAt).toBeDefined();
            expect(savedClassroom.createdAt).toBeInstanceOf(Date);
            expect(savedClassroom.updatedAt).toBeInstanceOf(Date);
        });

        it("should update updatedAt when modified", async () => {
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();
            const originalUpdatedAt = savedClassroom.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedClassroom.studentCount = 15;
            await savedClassroom.save();

            expect(savedClassroom.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Static Methods", () => {
        describe("recalculateStudentCount", () => {
            it("should recalculate and update student count", async () => {
                // Create a classroom
                const classroomData = {
                    school: mockSchoolId,
                    stage: "basic",
                    level: 1,
                    teacher: mockTeacherId,
                    studentCount: 0
                };

                const classroom = new Classroom(classroomData);
                const savedClassroom = await classroom.save();

                // Mock Student.countDocuments to return 15
                const mockCountDocuments = jest.spyOn(Student, "countDocuments");
                mockCountDocuments.mockResolvedValue(15);

                await Classroom.recalculateStudentCount(savedClassroom._id);

                const updatedClassroom = await Classroom.findById(savedClassroom._id);
                expect(updatedClassroom.studentCount).toBe(15);

                mockCountDocuments.mockRestore();
            });
        });

        describe("seedDefaultStructure", () => {
            it("should create default classroom structure for a school", async () => {
                const result = await Classroom.seedDefaultStructure(mockSchoolId, mockTeacherId);

                // Should create: 1 creche + 3 kg + 6 basic + 3 jss + 3 sss = 16 classrooms
                expect(result.length).toBe(16);

                // Verify some specific classrooms exist
                const creche = result.find(c => c.stage === "creche" && c.level === 1);
                expect(creche).toBeDefined();
                expect(creche.school.toString()).toBe(mockSchoolId.toString());
                expect(creche.section).toBe("A");

                const kg3 = result.find(c => c.stage === "kg" && c.level === 3);
                expect(kg3).toBeDefined();

                const basic6 = result.find(c => c.stage === "basic" && c.level === 6);
                expect(basic6).toBeDefined();

                const sss3 = result.find(c => c.stage === "sss" && c.level === 3);
                expect(sss3).toBeDefined();
            });
        });
    });

    describe("Pre-delete Hooks", () => {
        it("should prevent deletion when classroom has students", async () => {
            // Create a classroom
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            // Mock Student.countDocuments to return 5 (students exist)
            const mockCountDocuments = jest.spyOn(Student, "countDocuments");
            mockCountDocuments.mockResolvedValue(5);

            await expect(Classroom.findByIdAndDelete(savedClassroom._id)).rejects.toThrow(
                `Cannot delete ${savedClassroom.label} — it still has 5 students.`
            );

            mockCountDocuments.mockRestore();
        });

        it("should allow deletion when classroom has no students", async () => {
            // Create a classroom
            const classroomData = {
                school: mockSchoolId,
                stage: "basic",
                level: 1,
                teacher: mockTeacherId
            };

            const classroom = new Classroom(classroomData);
            const savedClassroom = await classroom.save();

            // Mock Student.countDocuments to return 0 (no students)
            const mockCountDocuments = jest.spyOn(Student, "countDocuments");
            mockCountDocuments.mockResolvedValue(0);

            await expect(Classroom.findByIdAndDelete(savedClassroom._id)).resolves.toBeDefined();

            mockCountDocuments.mockRestore();
        });
    });
});
