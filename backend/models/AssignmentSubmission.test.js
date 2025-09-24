import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AssignmentSubmission from "./AssignmentSubmission.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-assignment-submission' },
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

describe("AssignmentSubmission Model", () => {
    // Mock ObjectIds for testing
    const mockAssignmentId = new mongoose.Types.ObjectId();
    const mockStudentId = new mongoose.Types.ObjectId();
    const mockGradedById = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create an assignment submission with all required fields", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.assignment.toString()).toBe(mockAssignmentId.toString());
            expect(savedSubmission.student.toString()).toBe(mockStudentId.toString());
            expect(savedSubmission.status).toBe("pending");
            expect(savedSubmission.submittedAt).toBeInstanceOf(Date);
            expect(savedSubmission.attachments).toEqual([]);
        });

        it("should create a submission with text submission", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                textSubmission: "This is my assignment submission text."
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.textSubmission).toBe("This is my assignment submission text.");
        });

        it("should create a submission with attachments", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: "document.pdf",
                        url: "https://example.com/document.pdf",
                        fileType: "application/pdf"
                    },
                    {
                        fileName: "image.jpg",
                        url: "https://example.com/image.jpg",
                        fileType: "image/jpeg"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.attachments).toHaveLength(2);
            expect(savedSubmission.attachments[0].fileName).toBe("document.pdf");
            expect(savedSubmission.attachments[0].url).toBe("https://example.com/document.pdf");
            expect(savedSubmission.attachments[0].fileType).toBe("application/pdf");
            expect(savedSubmission.attachments[1].fileName).toBe("image.jpg");
            expect(savedSubmission.attachments[1].url).toBe("https://example.com/image.jpg");
            expect(savedSubmission.attachments[1].fileType).toBe("image/jpeg");
        });

        it("should create a graded submission with feedback", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "graded",
                grade: "A",
                feedback: "Excellent work! Well done.",
                gradedBy: mockGradedById
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.status).toBe("graded");
            expect(savedSubmission.grade).toBe("A");
            expect(savedSubmission.feedback).toBe("Excellent work! Well done.");
            expect(savedSubmission.gradedBy.toString()).toBe(mockGradedById.toString());
        });

        it("should create a late submission", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "late",
                submittedAt: new Date("2025-01-15")
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.status).toBe("late");
            expect(savedSubmission.submittedAt).toEqual(new Date("2025-01-15"));
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create submission without assignment", async () => {
            const submissionData = {
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            await expect(submission.save()).rejects.toThrow(/assignment.*required/i);
        });

        it("should fail to create submission without student", async () => {
            const submissionData = {
                assignment: mockAssignmentId
            };

            const submission = new AssignmentSubmission(submissionData);
            await expect(submission.save()).rejects.toThrow(/student.*required/i);
        });

        it("should fail to create attachment without fileName", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        url: "https://example.com/file.pdf",
                        fileType: "application/pdf"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            await expect(submission.save()).rejects.toThrow(/fileName.*required/i);
        });

        it("should fail to create attachment without url", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: "document.pdf",
                        fileType: "application/pdf"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            await expect(submission.save()).rejects.toThrow(/url.*required/i);
        });
    });

    describe("Field Validation", () => {
        it("should accept valid status values", async () => {
            const validStatuses = ["pending", "submitted", "late", "graded"];
            const mockStudentIds = [
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId(),
                new mongoose.Types.ObjectId()
            ];

            for (let i = 0; i < validStatuses.length; i++) {
                const submissionData = {
                    assignment: mockAssignmentId,
                    student: mockStudentIds[i],
                    status: validStatuses[i]
                };

                const submission = new AssignmentSubmission(submissionData);
                const savedSubmission = await submission.save();
                expect(savedSubmission.status).toBe(validStatuses[i]);
            }
        });

        it("should reject invalid status values", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "invalid"
            };

            const submission = new AssignmentSubmission(submissionData);
            await expect(submission.save()).rejects.toThrow(/not a valid enum value/i);
        });

        it("should trim textSubmission", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                textSubmission: "   This is my submission   "
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.textSubmission).toBe("This is my submission");
        });

        it("should trim grade", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "graded",
                grade: "   A+   "
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.grade).toBe("A+");
        });

        it("should trim feedback", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "graded",
                feedback: "   Good work!   "
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.feedback).toBe("Good work!");
        });
    });

    describe("Default Values", () => {
        it("should default status to pending", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.status).toBe("pending");
        });

        it("should default submittedAt to current date", async () => {
            const beforeCreate = new Date();
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            const afterCreate = new Date();

            expect(savedSubmission.submittedAt).toBeInstanceOf(Date);
            expect(savedSubmission.submittedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedSubmission.submittedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should default attachments to empty array", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.attachments).toEqual([]);
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const beforeCreate = new Date();
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            const afterCreate = new Date();

            expect(savedSubmission.createdAt).toBeInstanceOf(Date);
            expect(savedSubmission.updatedAt).toBeInstanceOf(Date);
            expect(savedSubmission.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedSubmission.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            const originalUpdatedAt = savedSubmission.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedSubmission.status = "submitted";
            await savedSubmission.save();

            expect(savedSubmission.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Unique Constraints", () => {
        it("should enforce unique constraint on assignment and student", async () => {
            // Create first submission
            const submissionData1 = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "submitted"
            };

            const submission1 = new AssignmentSubmission(submissionData1);
            await submission1.save();

            // Try to create duplicate submission
            const submissionData2 = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "late"
            };

            const submission2 = new AssignmentSubmission(submissionData2);
            await expect(submission2.save()).rejects.toThrow(/duplicate key/i);
        });

        it("should allow same student to submit different assignments", async () => {
            const mockAssignmentId2 = new mongoose.Types.ObjectId();

            // Create submission for first assignment
            const submissionData1 = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "submitted"
            };

            const submission1 = new AssignmentSubmission(submissionData1);
            await submission1.save();

            // Create submission for second assignment (should succeed)
            const submissionData2 = {
                assignment: mockAssignmentId2,
                student: mockStudentId,
                status: "submitted"
            };

            const submission2 = new AssignmentSubmission(submissionData2);
            const savedSubmission2 = await submission2.save();

            expect(savedSubmission2.assignment.toString()).toBe(mockAssignmentId2.toString());
            expect(savedSubmission2.student.toString()).toBe(mockStudentId.toString());
        });

        it("should allow same assignment to have submissions from different students", async () => {
            const mockStudentId2 = new mongoose.Types.ObjectId();

            // Create submission for first student
            const submissionData1 = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "submitted"
            };

            const submission1 = new AssignmentSubmission(submissionData1);
            await submission1.save();

            // Create submission for second student (should succeed)
            const submissionData2 = {
                assignment: mockAssignmentId,
                student: mockStudentId2,
                status: "submitted"
            };

            const submission2 = new AssignmentSubmission(submissionData2);
            const savedSubmission2 = await submission2.save();

            expect(savedSubmission2.assignment.toString()).toBe(mockAssignmentId.toString());
            expect(savedSubmission2.student.toString()).toBe(mockStudentId2.toString());
        });
    });

    describe("Attachment Schema", () => {
        it("should validate attachment required fields", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: "test.pdf",
                        url: "https://example.com/test.pdf"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.attachments[0].fileName).toBe("test.pdf");
            expect(savedSubmission.attachments[0].url).toBe("https://example.com/test.pdf");
            expect(savedSubmission.attachments[0].fileType).toBeUndefined();
        });

        it("should accept attachments with optional fileType", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: "document.docx",
                        url: "https://example.com/document.docx",
                        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.attachments[0].fileType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        });

        it("should handle multiple attachments with different file types", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: "essay.pdf",
                        url: "https://example.com/essay.pdf",
                        fileType: "application/pdf"
                    },
                    {
                        fileName: "diagram.png",
                        url: "https://example.com/diagram.png",
                        fileType: "image/png"
                    },
                    {
                        fileName: "spreadsheet.xlsx",
                        url: "https://example.com/spreadsheet.xlsx",
                        fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            expect(savedSubmission.attachments).toHaveLength(3);
            expect(savedSubmission.attachments[0].fileType).toBe("application/pdf");
            expect(savedSubmission.attachments[1].fileType).toBe("image/png");
            expect(savedSubmission.attachments[2].fileType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        });
    });

    describe("Data Integrity", () => {
        it("should handle empty textSubmission", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                textSubmission: ""
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.textSubmission).toBe("");
        });

        it("should handle empty grade", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "graded",
                grade: ""
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.grade).toBe("");
        });

        it("should handle empty feedback", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "graded",
                feedback: ""
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.feedback).toBe("");
        });

        it("should handle long text submissions", async () => {
            const longText = "A".repeat(10000); // 10,000 characters
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                textSubmission: longText
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.textSubmission).toBe(longText);
        });

        it("should handle special characters in text fields", async () => {
            const specialText = "Special chars: @#$%^&*()_+{}|:<>?[]\\;',./ñéü";
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                textSubmission: specialText,
                feedback: specialText,
                grade: "A+@#$"
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.textSubmission).toBe(specialText);
            expect(savedSubmission.feedback).toBe(specialText);
            expect(savedSubmission.grade).toBe("A+@#$");
        });

        it("should handle very long file names and URLs", async () => {
            const longFileName = "A".repeat(255) + ".pdf";
            const longUrl = "https://example.com/" + "A".repeat(1000) + ".pdf";

            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: longFileName,
                        url: longUrl,
                        fileType: "application/pdf"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.attachments[0].fileName).toBe(longFileName);
            expect(savedSubmission.attachments[0].url).toBe(longUrl);
        });

        it("should handle unicode characters in file names", async () => {
            const unicodeFileName = "文档_2025_第一学期_数学作业.pdf";
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                attachments: [
                    {
                        fileName: unicodeFileName,
                        url: "https://example.com/" + encodeURIComponent(unicodeFileName),
                        fileType: "application/pdf"
                    }
                ]
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();
            expect(savedSubmission.attachments[0].fileName).toBe(unicodeFileName);
        });
    });

    describe("Indexing", () => {
        it("should create submissions with proper indexing", async () => {
            const submissionData = {
                assignment: mockAssignmentId,
                student: mockStudentId,
                status: "submitted"
            };

            const submission = new AssignmentSubmission(submissionData);
            const savedSubmission = await submission.save();

            // Check that the document was saved successfully (indexing is handled by MongoDB)
            expect(savedSubmission._id).toBeDefined();
            expect(savedSubmission.assignment.toString()).toBe(mockAssignmentId.toString());
            expect(savedSubmission.student.toString()).toBe(mockStudentId.toString());
        });
    });
});
