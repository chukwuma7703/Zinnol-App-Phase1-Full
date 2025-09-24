import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Assignment from "./Assignment.js";

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'jest-assignment' },
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

describe("Assignment Model", () => {
    // Mock ObjectIds for testing
    const mockSchoolId = new mongoose.Types.ObjectId();
    const mockClassroomId = new mongoose.Types.ObjectId();
    const mockSubjectId = new mongoose.Types.ObjectId();
    const mockTeacherId = new mongoose.Types.ObjectId();

    describe("Schema Validation", () => {
        it("should create an assignment with all required fields", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Mathematics Homework",
                description: "Complete exercises 1-10 from chapter 5",
                dueDate: new Date("2024-12-31")
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();

            expect(savedAssignment.school.toString()).toBe(mockSchoolId.toString());
            expect(savedAssignment.classroom.toString()).toBe(mockClassroomId.toString());
            expect(savedAssignment.subject.toString()).toBe(mockSubjectId.toString());
            expect(savedAssignment.teacher.toString()).toBe(mockTeacherId.toString());
            expect(savedAssignment.title).toBe("Mathematics Homework");
            expect(savedAssignment.description).toBe("Complete exercises 1-10 from chapter 5");
            expect(savedAssignment.dueDate).toEqual(new Date("2024-12-31"));
            expect(savedAssignment.attachments).toEqual([]);
            expect(savedAssignment.status).toBe("draft");
        });

        it("should create an assignment with attachments and custom status", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Science Project",
                description: "Build a model volcano and write a report",
                dueDate: new Date("2024-11-15"),
                attachments: [
                    {
                        fileName: "project_guidelines.pdf",
                        url: "https://storage.example.com/guidelines.pdf",
                        fileType: "application/pdf"
                    },
                    {
                        fileName: "reference_material.docx",
                        url: "https://storage.example.com/reference.docx",
                        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    }
                ],
                status: "published"
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();

            expect(savedAssignment.attachments).toHaveLength(2);
            expect(savedAssignment.attachments[0].fileName).toBe("project_guidelines.pdf");
            expect(savedAssignment.attachments[0].url).toBe("https://storage.example.com/guidelines.pdf");
            expect(savedAssignment.attachments[0].fileType).toBe("application/pdf");
            expect(savedAssignment.status).toBe("published");
        });

        it("should trim title and description", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "  English Essay  ",
                description: "  Write a 500-word essay on climate change  ",
                dueDate: new Date("2024-10-20")
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();

            expect(savedAssignment.title).toBe("English Essay");
            expect(savedAssignment.description).toBe("Write a 500-word essay on climate change");
        });
    });

    describe("Required Field Validation", () => {
        it("should fail to create assignment without school", async () => {
            const assignmentData = {
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/school.*required/i);
        });

        it("should fail to create assignment without classroom", async () => {
            const assignmentData = {
                school: mockSchoolId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/classroom.*required/i);
        });

        it("should fail to create assignment without subject", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/subject.*required/i);
        });

        it("should fail to create assignment without teacher", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/teacher.*required/i);
        });

        it("should fail to create assignment without title", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/Assignment title is required/i);
        });

        it("should fail to create assignment without description", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/Assignment description is required/i);
        });

        it("should fail to create assignment without dueDate", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description"
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/due date is required/i);
        });
    });

    describe("Field Validation", () => {
        it("should enforce title maxlength", async () => {
            const longTitle = "A".repeat(201); // 201 characters
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: longTitle,
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow();
        });

        it("should enforce description maxlength", async () => {
            const longDescription = "A".repeat(5001); // 5001 characters
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: longDescription,
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow();
        });

        it("should accept valid status values", async () => {
            const validStatuses = ["draft", "published", "closed"];

            for (const status of validStatuses) {
                const assignmentData = {
                    school: mockSchoolId,
                    classroom: mockClassroomId,
                    subject: mockSubjectId,
                    teacher: mockTeacherId,
                    title: `Test Assignment ${status}`,
                    description: "Test description",
                    dueDate: new Date(),
                    status
                };

                const assignment = new Assignment(assignmentData);
                const savedAssignment = await assignment.save();
                expect(savedAssignment.status).toBe(status);
            }
        });

        it("should reject invalid status values", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date(),
                status: "invalid"
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow();
        });

        it("should accept valid dueDate", async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Future Assignment",
                description: "Test description",
                dueDate: futureDate
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();
            expect(savedAssignment.dueDate).toEqual(futureDate);
        });
    });

    describe("Attachment Schema", () => {
        it("should validate attachment required fields", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date(),
                attachments: [
                    {
                        url: "https://storage.example.com/file.pdf"
                        // missing fileName
                    }
                ]
            };

            const assignment = new Assignment(assignmentData);
            await expect(assignment.save()).rejects.toThrow(/fileName.*required/i);
        });

        it("should accept attachments with optional fileType", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Test Assignment",
                description: "Test description",
                dueDate: new Date(),
                attachments: [
                    {
                        fileName: "document.pdf",
                        url: "https://storage.example.com/document.pdf"
                        // no fileType
                    }
                ]
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();
            expect(savedAssignment.attachments[0].fileType).toBeUndefined();
        });
    });

    describe("Timestamps", () => {
        it("should automatically set createdAt and updatedAt", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Timestamp Test",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();

            expect(savedAssignment.createdAt).toBeInstanceOf(Date);
            expect(savedAssignment.updatedAt).toBeInstanceOf(Date);
            expect(savedAssignment.updatedAt.getTime()).toBeGreaterThanOrEqual(savedAssignment.createdAt.getTime());
        });

        it("should update updatedAt when modified", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Update Test",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();
            const originalUpdatedAt = savedAssignment.updatedAt;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            savedAssignment.status = "published";
            await savedAssignment.save();

            expect(savedAssignment.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe("Default Values", () => {
        it("should default status to draft", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Default Status Test",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();

            expect(savedAssignment.status).toBe("draft");
        });

        it("should default attachments to empty array", async () => {
            const assignmentData = {
                school: mockSchoolId,
                classroom: mockClassroomId,
                subject: mockSubjectId,
                teacher: mockTeacherId,
                title: "Default Attachments Test",
                description: "Test description",
                dueDate: new Date()
            };

            const assignment = new Assignment(assignmentData);
            const savedAssignment = await assignment.save();

            expect(savedAssignment.attachments).toEqual([]);
        });
    });

    describe("Indexing", () => {
        it("should create assignments with proper indexing", async () => {
            // Create multiple assignments to test indexing
            const assignments = [
                {
                    school: mockSchoolId,
                    classroom: mockClassroomId,
                    subject: mockSubjectId,
                    teacher: mockTeacherId,
                    title: "Assignment 1",
                    description: "Description 1",
                    dueDate: new Date("2024-12-01")
                },
                {
                    school: mockSchoolId,
                    classroom: mockClassroomId,
                    subject: mockSubjectId,
                    teacher: mockTeacherId,
                    title: "Assignment 2",
                    description: "Description 2",
                    dueDate: new Date("2024-12-15")
                }
            ];

            await Assignment.insertMany(assignments);

            // Query should use the compound index
            const foundAssignments = await Assignment.find({
                school: mockSchoolId,
                classroom: mockClassroomId
            }).sort({ dueDate: -1 });

            expect(foundAssignments).toHaveLength(2);
            expect(foundAssignments[0].dueDate.getTime()).toBeGreaterThan(foundAssignments[1].dueDate.getTime());
        });
    });
});
