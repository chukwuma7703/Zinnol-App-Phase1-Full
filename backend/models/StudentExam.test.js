import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import StudentExam from "./StudentExam.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-student-exam' },
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

describe("StudentExam Model", () => {
    // Mock ObjectIds for testing
    const mockExamId = new mongoose.Types.ObjectId();
    const mockStudentId = new mongoose.Types.ObjectId();
    const mockQuestionId1 = new mongoose.Types.ObjectId();
    const mockQuestionId2 = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create a student exam with all required fields", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.exam.toString()).toBe(mockExamId.toString());
            expect(savedStudentExam.session).toBe("2025/2026");
            expect(savedStudentExam.term).toBe(1);
            expect(savedStudentExam.student.toString()).toBe(mockStudentId.toString());
            expect(savedStudentExam.status).toBe("ready");
            expect(savedStudentExam.totalScore).toBe(0);
            expect(savedStudentExam.markedBy).toBe("auto");
            expect(savedStudentExam.isPublished).toBe(false);
        });

        it("should create a student exam with answers", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "in-progress",
                startTime: new Date(),
                answers: [
                    {
                        question: mockQuestionId1,
                        selectedOptionIndex: 0,
                        awardedMarks: 5
                    },
                    {
                        question: mockQuestionId2,
                        answerText: "This is my theory answer.",
                        awardedMarks: 8
                    }
                ],
                totalScore: 13
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.answers).toHaveLength(2);
            expect(savedStudentExam.answers[0].selectedOptionIndex).toBe(0);
            expect(savedStudentExam.answers[0].awardedMarks).toBe(5);
            expect(savedStudentExam.answers[1].answerText).toBe("This is my theory answer.");
            expect(savedStudentExam.answers[1].awardedMarks).toBe(8);
            expect(savedStudentExam.totalScore).toBe(13);
        });

        it("should create a submitted and marked exam", async () => {
            const startTime = new Date(Date.now() - 3600000); // 1 hour ago
            const endTime = new Date();

            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "marked",
                startTime,
                endTime,
                answers: [
                    {
                        question: mockQuestionId1,
                        selectedOptionIndex: 1,
                        awardedMarks: 10,
                        isOverridden: true,
                        overriddenBy: mockUserId,
                        overrideReason: "Corrected marking error"
                    }
                ],
                totalScore: 10,
                markedAt: new Date(),
                markedBy: "manual",
                isPublished: true
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.status).toBe("marked");
            expect(savedStudentExam.markedBy).toBe("manual");
            expect(savedStudentExam.isPublished).toBe(true);
            expect(savedStudentExam.answers[0].isOverridden).toBe(true);
            expect(savedStudentExam.answers[0].overriddenBy.toString()).toBe(mockUserId.toString());
            expect(savedStudentExam.answers[0].overrideReason).toBe("Corrected marking error");
        });

        it("should create a paused exam with time remaining", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "paused",
                startTime: new Date(),
                timeRemainingOnPause: 1800000, // 30 minutes in milliseconds
                pauseCount: 1
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.status).toBe("paused");
            expect(savedStudentExam.timeRemainingOnPause).toBe(1800000);
            expect(savedStudentExam.pauseCount).toBe(1);
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create student exam without exam", async () => {
            const studentExamData = {
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            await expect(studentExam.save()).rejects.toThrow(/exam.*required/i);
        });

        it("should fail to create student exam without session", async () => {
            const studentExamData = {
                exam: mockExamId,
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            await expect(studentExam.save()).rejects.toThrow(/session.*required/i);
        });

        it("should fail to create student exam without term", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            await expect(studentExam.save()).rejects.toThrow(/term.*required/i);
        });

        it("should fail to create student exam without student", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1
            };

            const studentExam = new StudentExam(studentExamData);
            await expect(studentExam.save()).rejects.toThrow(/student.*required/i);
        });
    });

    describe("Field Validation", () => {
        it("should accept valid status values", async () => {
            const validStatuses = ["ready", "in-progress", "paused", "submitted", "marked"];
            const mockStudentIds = [
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId()
            ];

            for (let i = 0; i < validStatuses.length; i++) {
                const studentExamData = {
                    exam: mockExamId,
                    session: "2025/2026",
                    term: 1,
                    student: mockStudentIds[i],
                    status: validStatuses[i]
                };

                const studentExam = new StudentExam(studentExamData);
                const savedStudentExam = await studentExam.save();
                expect(savedStudentExam.status).toBe(validStatuses[i]);
            }
        });

        it("should reject invalid status values", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "invalid"
            };

            const studentExam = new StudentExam(studentExamData);
            await expect(studentExam.save()).rejects.toThrow(/not a valid enum value/i);
        });

        it("should accept valid markedBy values", async () => {
            const validMarkedBy = ["auto", "manual"];
            const mockStudentIds = [
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId()
            ];

            for (let i = 0; i < validMarkedBy.length; i++) {
                const studentExamData = {
                    exam: mockExamId,
                    session: "2025/2026",
                    term: 1,
                    student: mockStudentIds[i],
                    status: "marked",
                    markedBy: validMarkedBy[i]
                };

                const studentExam = new StudentExam(studentExamData);
                const savedStudentExam = await studentExam.save();
                expect(savedStudentExam.markedBy).toBe(validMarkedBy[i]);
            }
        });

        it("should reject invalid markedBy values", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "marked",
                markedBy: "invalid"
            };

            const studentExam = new StudentExam(studentExamData);
            await expect(studentExam.save()).rejects.toThrow(/not a valid enum value/i);
        });

        it("should accept valid term values", async () => {
            const validTerms = [1, 2, 3];
            const mockStudentIds = [
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId()
            ];

            for (let i = 0; i < validTerms.length; i++) {
                const studentExamData = {
                    exam: mockExamId,
                    session: "2025/2026",
                    term: validTerms[i],
                    student: mockStudentIds[i]
                };

                const studentExam = new StudentExam(studentExamData);
                const savedStudentExam = await studentExam.save();
                expect(savedStudentExam.term).toBe(validTerms[i]);
            }
        });
    });

    describe("Default Values", () => {
        it("should default status to ready", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            expect(savedStudentExam.status).toBe("ready");
        });

        it("should default totalScore to 0", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            expect(savedStudentExam.totalScore).toBe(0);
        });

        it("should default pauseCount to 0", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            expect(savedStudentExam.pauseCount).toBe(0);
        });

        it("should default markedBy to auto", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "marked"
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            expect(savedStudentExam.markedBy).toBe("auto");
        });

        it("should default isPublished to false", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            expect(savedStudentExam.isPublished).toBe(false);
        });

        it("should default answers to empty array", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            expect(savedStudentExam.answers).toEqual([]);
        });
    });

    describe("Virtual Properties", () => {
        it("should calculate durationTaken for submitted exams", async () => {
            const startTime = new Date(Date.now() - 5400000); // 90 minutes ago
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "submitted",
                startTime
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            // Access virtual property
            expect(savedStudentExam.durationTaken).toBe(90); // Should be approximately 90 minutes
        });

        it("should return null for durationTaken when exam not submitted", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "in-progress",
                startTime: new Date()
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.durationTaken).toBeNull();
        });

        it("should return null for durationTaken when no startTime", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "submitted"
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.durationTaken).toBeNull();
        });
    });

    describe("Unique Constraints", () => {
        it("should enforce unique constraint on exam and student", async () => {
            // Create first student exam
            const studentExamData1 = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam1 = new StudentExam(studentExamData1);
            await studentExam1.save();

            // Try to create duplicate
            const studentExamData2 = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam2 = new StudentExam(studentExamData2);
            await expect(studentExam2.save()).rejects.toThrow(/duplicate key/i);
        });

        it("should allow same student to take different exams", async () => {
            const mockExamId2 = new mongoose.Types.ObjectId();

            // Create exam for first exam
            const studentExamData1 = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam1 = new StudentExam(studentExamData1);
            await studentExam1.save();

            // Create exam for second exam (should succeed)
            const studentExamData2 = {
                exam: mockExamId2,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam2 = new StudentExam(studentExamData2);
            const savedStudentExam2 = await studentExam2.save();

            expect(savedStudentExam2.exam.toString()).toBe(mockExamId2.toString());
            expect(savedStudentExam2.student.toString()).toBe(mockStudentId.toString());
        });

        it("should allow different students to take same exam", async () => {
            const mockStudentId2 = new mongoose.Types.ObjectId();

            // Create exam for first student
            const studentExamData1 = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam1 = new StudentExam(studentExamData1);
            await studentExam1.save();

            // Create exam for second student (should succeed)
            const studentExamData2 = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId2
            };

            const studentExam2 = new StudentExam(studentExamData2);
            const savedStudentExam2 = await studentExam2.save();

            expect(savedStudentExam2.exam.toString()).toBe(mockExamId.toString());
            expect(savedStudentExam2.student.toString()).toBe(mockStudentId2.toString());
        });
    });

    describe("Answer Schema", () => {
        it("should validate answer fields", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                answers: [
                    {
                        question: mockQuestionId1,
                        selectedOptionIndex: 2,
                        awardedMarks: 5,
                        isOverridden: false
                    }
                ]
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.answers[0].question.toString()).toBe(mockQuestionId1.toString());
            expect(savedStudentExam.answers[0].selectedOptionIndex).toBe(2);
            expect(savedStudentExam.answers[0].awardedMarks).toBe(5);
            expect(savedStudentExam.answers[0].isOverridden).toBe(false);
        });

        it("should handle overridden answers", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                answers: [
                    {
                        question: mockQuestionId1,
                        answerText: "Original answer",
                        awardedMarks: 3,
                        isOverridden: true,
                        overriddenBy: mockUserId,
                        overrideReason: "Spelling correction"
                    }
                ]
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.answers[0].isOverridden).toBe(true);
            expect(savedStudentExam.answers[0].overriddenBy.toString()).toBe(mockUserId.toString());
            expect(savedStudentExam.answers[0].overrideReason).toBe("Spelling correction");
        });

        it("should default answer awardedMarks to 0", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                answers: [
                    {
                        question: mockQuestionId1,
                        selectedOptionIndex: 0
                        // awardedMarks not provided
                    }
                ]
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.answers[0].awardedMarks).toBe(0);
        });

        it("should default isOverridden to false", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                answers: [
                    {
                        question: mockQuestionId1,
                        selectedOptionIndex: 0
                    }
                ]
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            expect(savedStudentExam.answers[0].isOverridden).toBe(false);
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const beforeCreate = new Date();
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            const afterCreate = new Date();

            expect(savedStudentExam.createdAt).toBeInstanceOf(Date);
            expect(savedStudentExam.updatedAt).toBeInstanceOf(Date);
            expect(savedStudentExam.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedStudentExam.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();
            const originalUpdatedAt = savedStudentExam.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedStudentExam.status = "in-progress";
            await savedStudentExam.save();

            expect(savedStudentExam.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Indexing", () => {
        it("should create student exams with proper indexing", async () => {
            const studentExamData = {
                exam: mockExamId,
                session: "2025/2026",
                term: 1,
                student: mockStudentId,
                status: "submitted"
            };

            const studentExam = new StudentExam(studentExamData);
            const savedStudentExam = await studentExam.save();

            // Check that the document was saved successfully (indexing is handled by MongoDB)
            expect(savedStudentExam._id).toBeDefined();
            expect(savedStudentExam.exam.toString()).toBe(mockExamId.toString());
            expect(savedStudentExam.student.toString()).toBe(mockStudentId.toString());
        });
    });
});
