import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Exam from "./Exam.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-exam' },
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

describe("Exam Model", () => {
    // Mock ObjectIds for testing
    const mockSchoolId = new mongoose.Types.ObjectId();
    const mockClassroomId = new mongoose.Types.ObjectId();
    const mockSubjectId = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create an exam with all required fields", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Mathematics Final Exam",
                session: "2024-2025",
                term: 1,
                totalMarks: 100,
                createdBy: mockUserId,
                status: "draft",
                durationInMinutes: 120,
                maxPauses: 3
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.school.toString()).toBe(mockSchoolId.toString());
            expect(savedExam.classroom.toString()).toBe(mockClassroomId.toString());
            expect(savedExam.subject.toString()).toBe(mockSubjectId.toString());
            expect(savedExam.title).toBe("Mathematics Final Exam");
            expect(savedExam.session).toBe("2024-2025");
            expect(savedExam.term).toBe(1);
            expect(savedExam.totalMarks).toBe(100);
            expect(savedExam.createdBy.toString()).toBe(mockUserId.toString());
            expect(savedExam.status).toBe("draft");
            expect(savedExam.durationInMinutes).toBe(120);
            expect(savedExam.maxPauses).toBe(3);
            expect(savedExam.createdAt).toBeDefined();
            expect(savedExam.updatedAt).toBeDefined();
        });

        it("should create an exam with default values", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Basic Math Test",
                session: "2024-2025",
                term: 2
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.totalMarks).toBe(0);
            expect(savedExam.status).toBe("draft");
            expect(savedExam.maxPauses).toBe(3);
            expect(savedExam.createdAt).toBeDefined();
            expect(savedExam.updatedAt).toBeDefined();
        });

        it("should trim the title field", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "  Chemistry Exam  ",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.title).toBe("Chemistry Exam");
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create exam without school", async () => {
            const examData = {
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Test Exam",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/school.*required/i);
        });

        it("should fail to create exam without classroom", async () => {
            const examData = {
                school: mockSchoolId,
                subject: mockSubjectId,
                title: "Test Exam",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/classroom.*required/i);
        });

        it("should fail to create exam without subject", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                title: "Test Exam",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/subject.*required/i);
        });

        it("should fail to create exam without title", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/Exam title is required/i);
        });

        it("should fail to create exam without session", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Test Exam",
                term: 1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/session.*required/i);
        });

        it("should fail to create exam without term", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Test Exam",
                session: "2024-2025"
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/term.*required/i);
        });
    });

    describe("Field Constraints", () => {
        it("should accept valid status values", async () => {
            const draftExam = new Exam({
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Draft Exam",
                session: "2024-2025",
                term: 1,
                status: "draft"
            });

            const publishedExam = new Exam({
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Published Exam",
                session: "2024-2025",
                term: 1,
                status: "published"
            });

            const savedDraft = await draftExam.save();
            const savedPublished = await publishedExam.save();

            expect(savedDraft.status).toBe("draft");
            expect(savedPublished.status).toBe("published");
        });

        it("should reject invalid status values", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Invalid Status Exam",
                session: "2024-2025",
                term: 1,
                status: "invalid"
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow();
        });

        it("should accept durationInMinutes >= 1", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Valid Duration Exam",
                session: "2024-2025",
                term: 1,
                durationInMinutes: 60
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.durationInMinutes).toBe(60);
        });

        it("should reject durationInMinutes < 1", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Invalid Duration Exam",
                session: "2024-2025",
                term: 1,
                durationInMinutes: 0
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow();
        });

        it("should accept maxPauses >= 0", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Zero Pauses Exam",
                session: "2024-2025",
                term: 1,
                maxPauses: 0
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.maxPauses).toBe(0);
        });

        it("should reject maxPauses < 0", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Negative Pauses Exam",
                session: "2024-2025",
                term: 1,
                maxPauses: -1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow();
        });
    });

    describe("Data Types", () => {
        it("should store term as number", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Number Term Exam",
                session: "2024-2025",
                term: 3
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(typeof savedExam.term).toBe("number");
            expect(savedExam.term).toBe(3);
        });

        it("should store totalMarks as number", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Marks Exam",
                session: "2024-2025",
                term: 1,
                totalMarks: 85.5
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(typeof savedExam.totalMarks).toBe("number");
            expect(savedExam.totalMarks).toBe(85.5);
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Timestamp Test Exam",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.createdAt).toBeDefined();
            expect(savedExam.updatedAt).toBeDefined();
            expect(savedExam.createdAt).toBeInstanceOf(Date);
            expect(savedExam.updatedAt).toBeInstanceOf(Date);
        });

        it("should update updatedAt when modified", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Update Test Exam",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();
            const originalUpdatedAt = savedExam.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedExam.title = "Updated Title";
            await savedExam.save();

            expect(savedExam.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("ObjectId References", () => {
        it("should accept valid ObjectId for school", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "ObjectId Test Exam",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.school).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.school.toString()).toBe(mockSchoolId.toString());
        });

        it("should accept valid ObjectId for classroom", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Classroom ObjectId Test",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.classroom).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.classroom.toString()).toBe(mockClassroomId.toString());
        });

        it("should accept valid ObjectId for subject", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Subject ObjectId Test",
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.subject).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.subject.toString()).toBe(mockSubjectId.toString());
        });

        it("should accept valid ObjectId for createdBy", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "CreatedBy ObjectId Test",
                session: "2024-2025",
                term: 1,
                createdBy: mockUserId
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.createdBy.toString()).toBe(mockUserId.toString());
        });
    });

    describe("Edge Cases", () => {
        it("should reject empty string title after trimming", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "   ", // Only whitespace
                session: "2024-2025",
                term: 1
            };

            const exam = new Exam(examData);
            await expect(exam.save()).rejects.toThrow(/Exam title is required/i);
        });

        it("should handle large numbers for totalMarks", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Large Marks Exam",
                session: "2024-2025",
                term: 1,
                totalMarks: 999999
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.totalMarks).toBe(999999);
        });

        it("should handle decimal numbers for totalMarks", async () => {
            const examData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Decimal Marks Exam",
                session: "2024-2025",
                term: 1,
                totalMarks: 95.75
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam.totalMarks).toBe(95.75);
        });
    });
});
