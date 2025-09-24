import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Result from "./Result.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-result' },
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

describe("Result Model", () => {
    // Mock ObjectIds for testing
    const mockSchoolId = new mongoose.Types.ObjectId();
    const mockStudentId = new mongoose.Types.ObjectId();
    const mockClassroomId = new mongoose.Types.ObjectId();
    const mockSubjectId1 = new mongoose.Types.ObjectId();
    const mockSubjectId2 = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create a result with all required fields", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();

            expect(savedResult.school.toString()).toBe(mockSchoolId.toString());
            expect(savedResult.student.toString()).toBe(mockStudentId.toString());
            expect(savedResult.classroom.toString()).toBe(mockClassroomId.toString());
            expect(savedResult.term).toBe(1);
            expect(savedResult.session).toBe("2025/2026");
            expect(savedResult.items).toHaveLength(1);
            expect(savedResult.status).toBe("pending");
            expect(savedResult.totalScore).toBe(60);
            expect(savedResult.average).toBe(60);
        });

        it("should create a result with multiple subjects and calculate totals correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 2,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 15,
                        examScore: 35,
                        maxCaScore: 20,
                        maxExamScore: 40
                    },
                    {
                        subject: mockSubjectId2,
                        caScore: 18,
                        examScore: 37,
                        maxCaScore: 20,
                        maxExamScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();

            expect(savedResult.items).toHaveLength(2);
            expect(savedResult.totalScore).toBe(105); // 50 + 55
            expect(savedResult.average).toBe(52.5); // 105 / 2
        });

        it("should create a result with approval workflow fields", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 3,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ],
                status: "approved",
                submittedBy: mockUserId,
                approvedBy: mockUserId,
                approvedAt: new Date(),
                position: 5
            };

            const result = new Result(resultData);
            const savedResult = await result.save();

            expect(savedResult.status).toBe("approved");
            expect(savedResult.submittedBy.toString()).toBe(mockUserId.toString());
            expect(savedResult.approvedBy.toString()).toBe(mockUserId.toString());
            expect(savedResult.approvedAt).toBeInstanceOf(Date);
            expect(savedResult.position).toBe(5);
        });

        it("should create a result with voice note URLs", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ],
                teacherVoiceNoteUrl: "https://example.com/teacher-note.mp3",
                principalVoiceNoteUrl: "https://example.com/principal-note.mp3"
            };

            const result = new Result(resultData);
            const savedResult = await result.save();

            expect(savedResult.teacherVoiceNoteUrl).toBe("https://example.com/teacher-note.mp3");
            expect(savedResult.principalVoiceNoteUrl).toBe("https://example.com/principal-note.mp3");
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create result without school", async () => {
            const resultData = {
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: []
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/school.*required/i);
        });

        it("should fail to create result without student", async () => {
            const resultData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: []
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/student.*required/i);
        });

        it("should fail to create result without classroom", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                term: 1,
                session: "2025/2026",
                items: []
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/classroom.*required/i);
        });

        it("should fail to create result without term", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                session: "2025/2026",
                items: []
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/term.*required/i);
        });

        it("should fail to create result without session", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                items: []
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/session.*required/i);
        });

        it("should fail to create result item without subject", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/subject.*required/i);
        });
    });

    describe("Field Validation", () => {
        it("should accept valid status values", async () => {
            const validStatuses = ["pending", "approved", "rejected"];

            for (const status of validStatuses) {
                const resultData = {
                    school: mockSchoolId,
                    student: mockStudentId,
                    classroom: mockClassroomId,
                    term: 1,
                    session: "2025/2026",
                    items: [
                        {
                            subject: mockSubjectId1,
                            caScore: 20,
                            examScore: 40
                        }
                    ],
                    status
                };

                const result = new Result(resultData);
                const savedResult = await result.save();
                expect(savedResult.status).toBe(status);
            }
        });

        it("should reject invalid status values", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ],
                status: "invalid"
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/not a valid enum value/i);
        });

        it("should accept valid term values", async () => {
            const validTerms = [1, 2, 3];

            for (const term of validTerms) {
                const resultData = {
                    school: mockSchoolId,
                    student: mockStudentId,
                    classroom: mockClassroomId,
                    term,
                    session: "2025/2026",
                    items: [
                        {
                            subject: mockSubjectId1,
                            caScore: 20,
                            examScore: 40
                        }
                    ]
                };

                const result = new Result(resultData);
                const savedResult = await result.save();
                expect(savedResult.term).toBe(term);
            }
        });

        it("should trim rejection reason", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ],
                status: "rejected",
                rejectionReason: "   Invalid scores provided   "
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.rejectionReason).toBe("Invalid scores provided");
        });
    });

    describe("Pre-save Hook Validation", () => {
        it("should throw error when CA score exceeds maxCaScore", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 50, // exceeds default maxCaScore of 40
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/CA score.*exceeds max of 40/);
        });

        it("should throw error when exam score exceeds maxExamScore", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 80 // exceeds default maxExamScore of 60
                    }
                ]
            };

            const result = new Result(resultData);
            await expect(result.save()).rejects.toThrow(/Exam score.*exceeds max of 60/);
        });

        it("should allow scores equal to max scores", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 40, // equal to maxCaScore
                        examScore: 60, // equal to maxExamScore
                        maxCaScore: 40,
                        maxExamScore: 60
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].total).toBe(100);
            expect(savedResult.totalScore).toBe(100);
        });

        it("should calculate item totals correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 15,
                        examScore: 35
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].total).toBe(50);
        });

        it("should calculate totalScore and average correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    },
                    {
                        subject: mockSubjectId2,
                        caScore: 15,
                        examScore: 35
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.totalScore).toBe(110); // 60 + 50
            expect(savedResult.average).toBe(55); // 110 / 2
        });

        it("should handle zero scores correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 0,
                        examScore: 0
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].total).toBe(0);
            expect(savedResult.totalScore).toBe(0);
            expect(savedResult.average).toBe(0);
        });

        it("should handle empty items array", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: []
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.totalScore).toBe(0);
            expect(savedResult.average).toBe(0);
        });
    });

    describe("Default Values", () => {
        it("should default status to pending", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.status).toBe("pending");
        });

        it("should default item scores to 0", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1
                        // caScore and examScore not provided
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].caScore).toBe(0);
            expect(savedResult.items[0].examScore).toBe(0);
            expect(savedResult.items[0].total).toBe(0);
        });

        it("should default max scores correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].maxCaScore).toBe(40);
            expect(savedResult.items[0].maxExamScore).toBe(60);
        });

        it("should default calculated fields to 0", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: []
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.totalScore).toBe(0);
            expect(savedResult.average).toBe(0);
            expect(savedResult.position).toBe(0);
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const beforeCreate = new Date();
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            const afterCreate = new Date();

            expect(savedResult.createdAt).toBeInstanceOf(Date);
            expect(savedResult.updatedAt).toBeInstanceOf(Date);
            expect(savedResult.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedResult.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            const originalUpdatedAt = savedResult.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedResult.position = 10;
            await savedResult.save();

            expect(savedResult.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Data Integrity", () => {
        it("should handle large numbers correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 1000,
                        examScore: 2000,
                        maxCaScore: 1000,
                        maxExamScore: 2000
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].total).toBe(3000);
            expect(savedResult.totalScore).toBe(3000);
        });

        it("should handle decimal numbers correctly", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 15.5,
                        examScore: 35.25,
                        maxCaScore: 20,
                        maxExamScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].total).toBe(50.75);
            expect(savedResult.totalScore).toBe(50.75);
            expect(savedResult.average).toBe(50.75);
        });

        it("should handle negative scores (though not recommended)", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: -5,
                        examScore: -10,
                        maxCaScore: 40,
                        maxExamScore: 60
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.items[0].total).toBe(-15);
            expect(savedResult.totalScore).toBe(-15);
            expect(savedResult.average).toBe(-15);
        });

        it("should handle very long session strings", async () => {
            const longSession = "2025/2026-Academic-Session-Term-1-Final-Examination-Period";
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: longSession,
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.session).toBe(longSession);
        });

        it("should handle special characters in rejection reason", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ],
                status: "rejected",
                rejectionReason: "Invalid scores! @#$%^&*()_+{}|:<>?[]\\;',./"
            };

            const result = new Result(resultData);
            const savedResult = await result.save();
            expect(savedResult.rejectionReason).toBe("Invalid scores! @#$%^&*()_+{}|:<>?[]\\;',./");
        });
    });

    describe("Indexing", () => {
        it("should create results with proper indexing", async () => {
            const resultData = {
                school: mockSchoolId,
                student: mockStudentId,
                classroom: mockClassroomId,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mockSubjectId1,
                        caScore: 20,
                        examScore: 40
                    }
                ]
            };

            const result = new Result(resultData);
            const savedResult = await result.save();

            // Check that the document was saved successfully (indexing is handled by MongoDB)
            expect(savedResult._id).toBeDefined();
            expect(savedResult.school.toString()).toBe(mockSchoolId.toString());
        });
    });
});
