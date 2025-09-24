
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import { TestDatabase, TestHelpers, TestFactories } from "./testUtils.js";

describe("Exam Model", () => {
    let testSchool, testClassroom, testSubject, testTeacher;

    beforeEach(async () => {
        await TestHelpers.setupTestEnvironment();

        // Create test data
        testSchool = new mongoose.Types.ObjectId();
        testClassroom = new mongoose.Types.ObjectId();
        testSubject = new mongoose.Types.ObjectId();
        testTeacher = new mongoose.Types.ObjectId();
    });

    describe("Exam Creation", () => {
        it("should create a valid exam", async () => {
            const examData = {
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Mathematics Midterm Exam",
                session: "2024/2025",
                term: 1,
                totalMarks: 100,
                createdBy: testTeacher,
                status: "draft",
                durationInMinutes: 90,
                maxPauses: 3
            };

            const exam = new Exam(examData);
            const savedExam = await exam.save();

            expect(savedExam._id).toBeDefined();
            expect(savedExam.school.toString()).toBe(testSchool.toString());
            expect(savedExam.classroom.toString()).toBe(testClassroom.toString());
            expect(savedExam.subject.toString()).toBe(testSubject.toString());
            expect(savedExam.title).toBe(examData.title);
            expect(savedExam.session).toBe(examData.session);
            expect(savedExam.term).toBe(examData.term);
            expect(savedExam.totalMarks).toBe(examData.totalMarks);
            expect(savedExam.createdBy.toString()).toBe(testTeacher.toString());
            expect(savedExam.status).toBe(examData.status);
            expect(savedExam.durationInMinutes).toBe(examData.durationInMinutes);
            expect(savedExam.maxPauses).toBe(examData.maxPauses);
            expect(savedExam.createdAt).toBeDefined();
            expect(savedExam.updatedAt).toBeDefined();
        });

        it("should require school, classroom, subject, title, session, and term", async () => {
            const exam = new Exam({
                title: "Test Exam"
            });

            let error;
            try {
                await exam.save();
            } catch (err) {
                error = err;
            }

            expect(error).toBeDefined();
            expect(error.name).toBe("ValidationError");
            expect(error.errors.school).toBeDefined();
            expect(error.errors.classroom).toBeDefined();
            expect(error.errors.subject).toBeDefined();
            expect(error.errors.session).toBeDefined();
            expect(error.errors.term).toBeDefined();
        });

        it("should trim title whitespace", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "  Mathematics Exam  ",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            expect(savedExam.title).toBe("Mathematics Exam");
        });
    });

    describe("Default Values", () => {
        it("should set default status to draft", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            expect(savedExam.status).toBe("draft");
        });

        it("should set default totalMarks to 0", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            expect(savedExam.totalMarks).toBe(0);
        });

        it("should set default maxPauses to 3", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            expect(savedExam.maxPauses).toBe(3);
        });
    });

    describe("Field Validation", () => {
        it("should enforce minimum duration of 1 minute", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                durationInMinutes: 0
            });

            let error;
            try {
                await exam.save();
            } catch (err) {
                error = err;
            }

            expect(error).toBeDefined();
            expect(error.errors.durationInMinutes).toBeDefined();
        });

        it("should enforce minimum maxPauses of 0", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                maxPauses: -1
            });

            let error;
            try {
                await exam.save();
            } catch (err) {
                error = err;
            }

            expect(error).toBeDefined();
            expect(error.errors.maxPauses).toBeDefined();
        });

        it("should accept valid duration values", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                durationInMinutes: 120
            });

            const savedExam = await exam.save();
            expect(savedExam.durationInMinutes).toBe(120);
        });

        it("should accept valid maxPauses values", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                maxPauses: 5
            });

            const savedExam = await exam.save();
            expect(savedExam.maxPauses).toBe(5);
        });
    });

    describe("Status Enum", () => {
        it("should accept valid status values", async () => {
            const validStatuses = ["draft", "published"];

            for (const status of validStatuses) {
                const exam = new Exam({
                    school: testSchool,
                    classroom: testClassroom,
                    subject: testSubject,
                    title: `Test Exam ${status}`,
                    session: "2024/2025",
                    term: 1,
                    status: status
                });

                const savedExam = await exam.save();
                expect(savedExam.status).toBe(status);
            }
        });

        it("should reject invalid status values", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                status: "invalid_status"
            });

            let error;
            try {
                await exam.save();
            } catch (err) {
                error = err;
            }

            expect(error).toBeDefined();
            expect(error.name).toBe("ValidationError");
        });
    });

    describe("Reference Validation", () => {
        it("should accept valid ObjectId references", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                createdBy: testTeacher
            });

            const savedExam = await exam.save();

            expect(savedExam.school).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.classroom).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.subject).toBeInstanceOf(mongoose.Types.ObjectId);
            expect(savedExam.createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
        });

        it("should handle populated references", async () => {
            // This would typically be tested with actual populated data
            // For now, we test that the fields can store ObjectIds
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            expect(savedExam.school).toEqual(testSchool);
            expect(savedExam.classroom).toEqual(testClassroom);
            expect(savedExam.subject).toEqual(testSubject);
        });
    });

    describe("Timestamps", () => {
        it("should set createdAt and updatedAt on creation", async () => {
            const beforeCreate = new Date();

            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            const afterCreate = new Date();

            expect(savedExam.createdAt).toBeDefined();
            expect(savedExam.updatedAt).toBeDefined();
            expect(savedExam.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(savedExam.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it("should update updatedAt on modification", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1
            });

            const savedExam = await exam.save();
            const firstUpdate = savedExam.updatedAt;

            // Wait and update
            await new Promise(resolve => setTimeout(resolve, 10));
            savedExam.title = "Updated Exam Title";
            await savedExam.save();

            expect(savedExam.updatedAt.getTime()).toBeGreaterThan(firstUpdate.getTime());
        });
    });

    describe("Data Integrity", () => {
        it("should handle large totalMarks values", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 1,
                totalMarks: 1000
            });

            const savedExam = await exam.save();
            expect(savedExam.totalMarks).toBe(1000);
        });

        it("should handle decimal term values", async () => {
            const exam = new Exam({
                school: testSchool,
                classroom: testClassroom,
                subject: testSubject,
                title: "Test Exam",
                session: "2024/2025",
                term: 2.5
            });

            const savedExam = await exam.save();
            expect(savedExam.term).toBe(2.5);
        });
    });
});
