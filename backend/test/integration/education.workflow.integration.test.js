/**
 * Education Platform Integration Tests
 * End-to-end tests for cross-model relationships and business wo            // 6. Create Student User and Student Record
            const studentUser = await User.create({
                name: "Alice Johnson",
                email: "alice.johnson@testschool.edu",
                password: "hashedpassword123",
                role: "STUDENT",
                school: school._id,
                className: "JSS 1 A"
            });*/


import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Import all models
import School from "../../models/School.js";
import Subject from "../../models/Subject.js";
import Classroom from "../../models/Classroom.js";
import User from "../../models/userModel.js";
import Student from "../../models/Student.js";
import Teachers from "../../models/Teachers.js";
import Assignment from "../../models/Assignment.js";
import AssignmentSubmission from "../../models/AssignmentSubmission.js";
import Exam from "../../models/Exam.js";
import Question from "../../models/Question.js";
import StudentExam from "../../models/StudentExam.js";
import Result from "../../models/Result.js";
import ExamInvigilator from "../../models/ExamInvigilator.js";

describe("Education Platform Integration Tests", () => {
    let mongoServer;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create({
            instance: { dbName: 'jest-integration' },
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

    describe("Complete Education Workflow", () => {
        it("should create a complete school ecosystem with all relationships", async () => {
            // 1. Create School
            const school = await School.create({
                name: "Test International School",
                address: "123 Education Street",
                phone: "+1234567890",
                email: "info@testschool.edu",
                website: "https://testschool.edu",
                establishedYear: 2000,
                schoolType: "international",
                curriculum: ["Cambridge", "IB"],
                facilities: ["Library", "Laboratory", "Sports Ground"],
                coordinates: { latitude: 40.7128, longitude: -74.0060 }
            });

            // 2. Create Subjects
            const mathSubject = await Subject.create({
                school: school._id,
                name: "Mathematics",
                code: "MATH101",
                stageScope: ["BASIC", "JSS", "SSS"],
                maxMark: 100,
                description: "Advanced Mathematics"
            });

            const englishSubject = await Subject.create({
                school: school._id,
                name: "English Language",
                code: "ENG101",
                stageScope: ["BASIC", "JSS", "SSS"],
                maxMark: 100,
                description: "English Language Arts"
            });

            // 3. Create Teacher User
            const teacherUser = await User.create({
                name: "John Smith",
                email: "john.smith@testschool.edu",
                password: "hashedpassword123",
                role: "TEACHER",
                school: school._id
            });

            // 4. Create Teacher Record
            const teacher = await Teachers.create({
                user: teacherUser._id,
                subjects: [mathSubject._id, englishSubject._id]
            });

            // 5. Create Classroom
            const classroom = await Classroom.create({
                school: school._id,
                stage: "jss",
                level: 1,
                section: "A",
                teacher: teacherUser._id,
                capacity: 30
            });

            // 6. Create Student User and Student Record
            const studentUser = await User.create({
                name: "Alice Johnson",
                email: "alice.johnson@testschool.edu",
                password: "hashedpassword123",
                role: "STUDENT",
                school: school._id,
                className: "SS 1 A"
            });

            const student = await Student.create({
                user: studentUser._id,
                school: school._id,
                classroom: classroom._id,
                firstName: "Alice",
                lastName: "Johnson",
                dateOfBirth: new Date("2010-05-15"),
                gender: "Female",
                admissionNumber: "STU001",
                enrollmentDate: new Date("2024-09-01")
            });

            // Verify classroom student count was updated
            await Classroom.recalculateStudentCount(classroom._id);
            let updatedClassroom = await Classroom.findById(classroom._id);
            expect(updatedClassroom.studentCount).toBe(1);

            // 7. Create Assignment
            const assignment = await Assignment.create({
                school: school._id,
                classroom: classroom._id,
                subject: mathSubject._id,
                teacher: teacherUser._id,
                title: "Quadratic Equations Problem Set",
                description: "Solve the following quadratic equations and show all work.",
                dueDate: new Date("2025-09-20"),
                status: "published",
                attachments: [
                    {
                        fileName: "equations.pdf",
                        url: "https://storage.test/equations.pdf",
                        fileType: "application/pdf"
                    }
                ]
            });

            // 8. Create Assignment Submission
            const submission = await AssignmentSubmission.create({
                assignment: assignment._id,
                student: student._id,
                textSubmission: "I have solved the quadratic equations as requested.",
                attachments: [
                    {
                        fileName: "solutions.pdf",
                        url: "https://storage.test/solutions.pdf",
                        fileType: "application/pdf"
                    }
                ],
                status: "submitted"
            });

            // 9. Create Exam
            const exam = await Exam.create({
                school: school._id,
                classroom: classroom._id,
                subject: mathSubject._id,
                title: "Mathematics Term 1 Examination",
                session: "2025/2026",
                term: 1,
                totalMarks: 100,
                durationInMinutes: 120,
                maxPauses: 2,
                status: "published",
                scheduledDate: new Date("2025-09-25"),
                createdBy: teacherUser._id
            });

            // 10. Create Exam Questions
            const question1 = await Question.create({
                exam: exam._id,
                questionText: "Solve: x² + 5x + 6 = 0",
                questionType: "objective",
                marks: 10,
                options: [
                    { text: "x = -2, -3" },
                    { text: "x = 2, 3" },
                    { text: "x = -2, 3" },
                    { text: "x = 2, -3" }
                ],
                correctOptionIndex: 0
            });

            const question2 = await Question.create({
                exam: exam._id,
                questionText: "Explain the quadratic formula and its derivation.",
                questionType: "theory",
                marks: 20,
                keywords: [
                    { text: "quadratic formula", marks: 5 },
                    { text: "derivation", marks: 5 },
                    { text: "discriminant", marks: 5 },
                    { text: "roots", marks: 5 }
                ]
            });

            // 11. Assign Exam Invigilator
            const examInvigilator = await ExamInvigilator.create({
                exam: exam._id,
                teacher: teacherUser._id,
                school: school._id,
                assignedBy: teacherUser._id
            });

            // 12. Create Student Exam
            const studentExam = await StudentExam.create({
                exam: exam._id,
                session: "2025/2026",
                term: 1,
                student: student._id,
                status: "in-progress",
                startTime: new Date(),
                answers: [
                    {
                        question: question1._id,
                        selectedOptionIndex: 0,
                        awardedMarks: 10
                    },
                    {
                        question: question2._id,
                        answerText: "The quadratic formula is x = (-b ± √(b²-4ac))/2a. It is derived from completing the square of the general quadratic equation ax² + bx + c = 0.",
                        awardedMarks: 18
                    }
                ],
                totalScore: 28
            });

            // 13. Create Result
            const result = await Result.create({
                school: school._id,
                student: student._id,
                classroom: classroom._id,
                term: 1,
                session: "2025/2026",
                items: [
                    {
                        subject: mathSubject._id,
                        caScore: 25,
                        examScore: 75,
                        maxExamScore: 100
                    },
                    {
                        subject: englishSubject._id,
                        caScore: 28,
                        examScore: 72,
                        maxExamScore: 100
                    }
                ],
                status: "approved",
                submittedBy: teacherUser._id,
                approvedBy: teacherUser._id,
                approvedAt: new Date(),
                position: 3
            });

            // Verify all relationships and calculations
            expect(result.totalScore).toBe(200); // 100 + 100
            expect(result.average).toBe(100); // 200 / 2

            // Verify populated relationships work
            const populatedResult = await Result.findById(result._id)
                .populate('school', 'name')
                .populate('student', 'firstName lastName')
                .populate('classroom', 'label')
                .populate('items.subject', 'name');

            expect(populatedResult.school.name).toBe("Test International School");
            expect(populatedResult.student.firstName).toBe("Alice");
            expect(populatedResult.items[0].subject.name).toBe("Mathematics");

            // Verify assignment relationships
            const populatedSubmission = await AssignmentSubmission.findById(submission._id)
                .populate('assignment', 'title')
                .populate('student', 'firstName lastName');

            expect(populatedSubmission.assignment.title).toBe("Quadratic Equations Problem Set");
            expect(populatedSubmission.student.firstName).toBe("Alice");

            // Verify exam relationships
            const populatedStudentExam = await StudentExam.findById(studentExam._id)
                .populate('exam', 'title')
                .populate('student', 'firstName lastName')
                .populate('answers.question', 'questionText questionType');

            expect(populatedStudentExam.exam.title).toBe("Mathematics Term 1 Examination");
            expect(populatedStudentExam.answers).toHaveLength(2);
            expect(populatedStudentExam.answers[0].question.questionType).toBe("objective");
            expect(populatedStudentExam.answers[1].question.questionType).toBe("theory");

            // Verify teacher relationships
            const populatedTeacher = await Teachers.findById(teacher._id)
                .populate('user', 'name email')
                .populate('subjects', 'name code');

            expect(populatedTeacher.user.name).toBe("John Smith");
            expect(populatedTeacher.subjects).toHaveLength(2);
            expect(populatedTeacher.subjects[0].name).toBe("Mathematics");

            // Verify classroom relationships
            const populatedClassroom = await Classroom.findById(classroom._id)
                .populate('school', 'name')
                .populate('teacher', 'name');

            expect(populatedClassroom.school.name).toBe("Test International School");
            expect(populatedClassroom.teacher.name).toBe("John Smith");
            expect(populatedClassroom.studentCount).toBe(1);
        });

        it("should handle classroom capacity constraints", async () => {
            // Create school and teacher first
            const school = await School.create({
                name: "Small School",
                address: "456 Tiny Street"
            });

            const teacherUser = await User.create({
                name: "Jane Doe",
                email: "jane@test.com",
                password: "password",
                role: "TEACHER",
                school: school._id
            });

            const classroom = await Classroom.create({
                school: school._id,
                stage: "basic",
                level: 3,
                section: "A",
                capacity: 2,
                teacher: teacherUser._id
            });

            const student1User = await User.create({
                name: "Student One",
                email: "student1@test.com",
                password: "password",
                role: "STUDENT",
                school: school._id
            });

            const student1 = await Student.create({
                user: student1User._id,
                school: school._id,
                classroom: classroom._id,
                firstName: "Student",
                lastName: "One",
                dateOfBirth: new Date("2012-01-01"),
                gender: "Male",
                admissionNumber: "STU001",
                enrollmentDate: new Date()
            });

            // Add second student
            const student2User = await User.create({
                name: "Student Two",
                email: "student2@test.com",
                password: "password",
                role: "STUDENT",
                school: school._id
            });

            const student2 = await Student.create({
                user: student2User._id,
                school: school._id,
                classroom: classroom._id,
                firstName: "Student",
                lastName: "Two",
                dateOfBirth: new Date("2012-02-01"),
                gender: "Female",
                admissionNumber: "STU002",
                enrollmentDate: new Date()
            });

            // Check classroom is now at capacity
            await Classroom.recalculateStudentCount(classroom._id);
            const updatedClassroom = await Classroom.findById(classroom._id);
            expect(updatedClassroom.studentCount).toBe(2);
            expect(updatedClassroom.remainingSeats).toBe(0);

            // Try to add third student (should work but classroom will be over capacity)
            const student3User = await User.create({
                name: "Student Three",
                email: "student3@test.com",
                password: "password",
                role: "STUDENT",
                school: school._id
            });

            const student3 = await Student.create({
                user: student3User._id,
                school: school._id,
                classroom: classroom._id,
                firstName: "Student",
                lastName: "Three",
                dateOfBirth: new Date("2012-03-01"),
                gender: "Male",
                admissionNumber: "STU003",
                enrollmentDate: new Date()
            });

            await Classroom.recalculateStudentCount(classroom._id);
            const finalClassroom = await Classroom.findById(classroom._id);
            expect(finalClassroom.studentCount).toBe(3);
            // When over capacity, remaining seats clamp at 0
            expect(finalClassroom.remainingSeats).toBe(0);
        });

        it("should maintain referential integrity across models", async () => {
            // Create base entities
            const school = await School.create({
                name: "Integrity Test School"
            });

            const subject = await Subject.create({
                school: school._id,
                name: "Physics",
                code: "PHY101"
            });

            const teacherUser = await User.create({
                name: "Dr. Physics",
                email: "physics@test.com",
                password: "password",
                role: "TEACHER",
                school: school._id
            });

            const classroom = await Classroom.create({
                school: school._id,
                stage: "sss",
                level: 1,
                teacher: teacherUser._id
            });

            // Create dependent entities
            const assignment = await Assignment.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                teacher: teacherUser._id,
                title: "Physics Assignment",
                description: "Complete physics problems",
                dueDate: new Date("2025-10-01")
            });

            const exam = await Exam.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                title: "Physics Exam",
                session: "2025/2026",
                term: 1,
                totalMarks: 100,
                durationInMinutes: 90,
                createdBy: teacherUser._id
            });

            // Verify counts and relationships
            const schoolAssignments = await Assignment.countDocuments({ school: school._id });
            const schoolExams = await Exam.countDocuments({ school: school._id });
            const classroomAssignments = await Assignment.countDocuments({ classroom: classroom._id });
            const subjectAssignments = await Assignment.countDocuments({ subject: subject._id });

            expect(schoolAssignments).toBe(1);
            expect(schoolExams).toBe(1);
            expect(classroomAssignments).toBe(1);
            expect(subjectAssignments).toBe(1);

            // Verify populated queries work
            const fullAssignment = await Assignment.findById(assignment._id)
                .populate('school', 'name')
                .populate('classroom', 'label')
                .populate('subject', 'name')
                .populate('teacher', 'name');

            expect(fullAssignment.school.name).toBe("Integrity Test School");
            expect(fullAssignment.classroom.label).toBe("S.S.S 1A");
            expect(fullAssignment.subject.name).toBe("Physics");
            expect(fullAssignment.teacher.name).toBe("Dr. Physics");
        });

        it("should handle complex exam and question relationships", async () => {
            const school = await School.create({
                name: "Exam Test School"
            });

            const subject = await Subject.create({
                school: school._id,
                name: "Chemistry",
                code: "CHEM101"
            });

            const teacherUser = await User.create({
                name: "Prof Chemistry",
                email: "chem@test.com",
                password: "password",
                role: "TEACHER",
                school: school._id
            });

            const classroom = await Classroom.create({
                school: school._id,
                stage: "sss",
                level: 2,
                teacher: teacherUser._id
            });

            const exam = await Exam.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                title: "Chemistry Final Exam",
                session: "2025/2026",
                term: 2,
                totalMarks: 100,
                durationInMinutes: 180,
                createdBy: teacherUser._id
            });

            // Create various question types
            const objectiveQuestion = await Question.create({
                exam: exam._id,
                questionText: "What is the chemical symbol for gold?",
                questionType: "objective",
                marks: 5,
                options: [
                    { text: "Au" },
                    { text: "Ag" },
                    { text: "Fe" },
                    { text: "Cu" }
                ],
                correctOptionIndex: 0
            });

            const theoryQuestion = await Question.create({
                exam: exam._id,
                questionText: "Explain the process of electrolysis.",
                questionType: "theory",
                marks: 15,
                keywords: [
                    { text: "electrolysis", marks: 3 },
                    { text: "anode", marks: 3 },
                    { text: "cathode", marks: 3 },
                    { text: "electrolyte", marks: 3 },
                    { text: "ions", marks: 3 }
                ]
            });

            const fillBlankQuestion = await Question.create({
                exam: exam._id,
                questionText: "The atomic number of carbon is ___.",
                questionType: "fill-in-the-blank",
                marks: 5,
                correctAnswers: ["6", "six"]
            });

            // Verify question relationships
            const examQuestions = await Question.find({ exam: exam._id });
            expect(examQuestions).toHaveLength(3);

            const questionTypes = examQuestions.map(q => q.questionType).sort();
            expect(questionTypes).toEqual(["fill-in-the-blank", "objective", "theory"]);

            // Verify question details
            const objQ = examQuestions.find(q => q.questionType === "objective");
            expect(objQ.options).toHaveLength(4);
            expect(objQ.correctOptionIndex).toBe(0);

            const theoryQ = examQuestions.find(q => q.questionType === "theory");
            expect(theoryQ.keywords).toHaveLength(5);

            const fillQ = examQuestions.find(q => q.questionType === "fill-in-the-blank");
            expect(fillQ.correctAnswers).toEqual(["6", "six"]);
        });
    });

    describe("Data Consistency and Constraints", () => {
        it("should prevent duplicate exam invigilator assignments", async () => {
            const school = await School.create({
                name: "Constraint Test School"
            });

            const teacherUser = await User.create({
                name: "Teacher One",
                email: "teacher@test.com",
                password: "password",
                role: "TEACHER",
                school: school._id
            });

            const subject = await Subject.create({
                school: school._id,
                name: "Test Subject",
                code: "TEST101"
            });

            const classroom = await Classroom.create({
                school: school._id,
                stage: "jss",
                level: 1,
                teacher: teacherUser._id
            });

            const exam = await Exam.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                title: "Test Exam",
                session: "2025/2026",
                term: 1,
                totalMarks: 100,
                durationInMinutes: 60,
                createdBy: teacherUser._id
            });

            // First assignment should work
            await ExamInvigilator.create({
                exam: exam._id,
                teacher: teacherUser._id,
                school: school._id,
                assignedBy: teacherUser._id
            });

            // Second assignment should fail
            await expect(ExamInvigilator.create({
                exam: exam._id,
                teacher: teacherUser._id,
                school: school._id,
                assignedBy: teacherUser._id
            })).rejects.toThrow(/duplicate key/i);
        });

        it("should maintain unique assignment-student submissions", async () => {
            const school = await School.create({
                name: "Unique Test School"
            });

            const subject = await Subject.create({
                school: school._id,
                name: "History",
                code: "HIST101"
            });

            const teacherUser = await User.create({
                name: "History Teacher",
                email: "history@test.com",
                password: "password",
                role: "TEACHER",
                school: school._id
            });

            const classroom = await Classroom.create({
                school: school._id,
                stage: "jss",
                level: 2,
                teacher: teacherUser._id
            });

            const studentUser = await User.create({
                name: "History Student",
                email: "student@test.com",
                password: "password",
                role: "STUDENT",
                school: school._id
            });

            const student = await Student.create({
                user: studentUser._id,
                school: school._id,
                classroom: classroom._id,
                firstName: "History",
                lastName: "Student",
                dateOfBirth: new Date("2011-01-01"),
                gender: "Male",
                admissionNumber: "STU004",
                enrollmentDate: new Date()
            });

            const assignment = await Assignment.create({
                school: school._id,
                classroom: classroom._id,
                subject: subject._id,
                teacher: teacherUser._id,
                title: "History Essay",
                description: "Write about World War II",
                dueDate: new Date("2025-10-01")
            });

            // First submission should work
            await AssignmentSubmission.create({
                assignment: assignment._id,
                student: student._id,
                textSubmission: "First submission"
            });

            // Second submission should fail
            await expect(AssignmentSubmission.create({
                assignment: assignment._id,
                student: student._id,
                textSubmission: "Second submission"
            })).rejects.toThrow(/duplicate key/i);
        });
    });
});
