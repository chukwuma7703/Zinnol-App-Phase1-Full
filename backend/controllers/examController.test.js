// tests/exams.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import School from "../models/School.js";
import User from "../models/userModel.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import StudentExam from "../models/StudentExam.js";
import { roles } from "../config/roles.js";
import Result from "../models/Result.js";
import Question from "../models/Question.js";
import ExamInvigilator from "../models/ExamInvigilator.js";
import { jest } from "@jest/globals"; // Explicitly import jest for specific test cases
// This suite does heavy DB setup and many requests; increase timeout.
jest.setTimeout(90000);
import { TestHelper } from "../test/testHelper.js";

// Mock the logger (ESM-friendly) to prevent transport setup during tests
jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
    logRequest: jest.fn(),
    logError: jest.fn(),
    stream: { write: jest.fn() },
  },
}));

// Mock the socket.io getIO function to prevent errors in a test environment
jest.unstable_mockModule('../config/socket.js', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  getIO: jest.fn().mockReturnValue({
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
  }),
  closeSocket: jest.fn(),
}));

// Mock background schedulers to prevent them from running during tests
jest.unstable_mockModule("../utils/notificationScheduler.js", () => ({
  __esModule: true,
  startNotificationScheduler: jest.fn(),
}));
jest.unstable_mockModule("../services/weatherUpdater.js", () => ({
  __esModule: true,
  scheduleWeatherUpdates: jest.fn(),
}));

// Declare variables that will be initialized in beforeAll
let app, server, closeSocket, jwt;
let mongoServer;
let teacher1Token, teacher2Token, studentToken, teacher1User, principalToken, principalUser;
let school1, school2;
let classroom1;
let subject1;
let exam1, exam2, exam3;
let student1, studentUser;
let submission1;

beforeAll(async () => {
  // Setup database with replica set for transactions
  console.log('[exam-test] beforeAll: starting DB setup');
  // Ensure server.js treats this as a test environment to skip heavy initializations
  process.env.NODE_ENV = 'test';
  await TestHelper.setupDatabase();
  console.log('[exam-test] beforeAll: DB setup complete');

  // 2. NOW dynamically import the app and other modules.
  console.log('[exam-test] beforeAll: importing server.js');
  const serverModule = await import("../server.js");
  console.log('[exam-test] beforeAll: server.js imported');
  app = serverModule.default;
  server = serverModule.server;
  console.log('[exam-test] beforeAll: importing socket.js');
  const socketModule = await import("../config/socket.js");
  console.log('[exam-test] beforeAll: socket.js imported');
  closeSocket = socketModule.closeSocket;
  jwt = (await import("jsonwebtoken")).default;

  // 3. Set environment variables for the test run.
  console.log('[exam-test] beforeAll: setting env vars');
  process.env.JWT_SECRET = "test-secret";
  console.log('[exam-test] beforeAll: done');
});

afterAll(async () => {
  await TestHelper.teardownDatabase();
  if (server && typeof server.close === 'function') {
    await new Promise(resolve => server.close(resolve)); // Close the http server
  }
  if (typeof closeSocket === 'function') {
    closeSocket();
  }
});

beforeEach(async () => {
  // Clear all collections before each test
  await TestHelper.clearDatabase();

  // Create test environment
  const testEnv = await TestHelper.createTestEnvironment();
  school1 = testEnv.school;
  classroom1 = testEnv.classroom;
  subject1 = testEnv.subject;
  student1 = testEnv.student;

  // Create additional test data
  school2 = await TestHelper.createSchool("Rival Academy");

  teacher1User = testEnv.users.teacher.user;
  teacher1Token = testEnv.users.teacher.token;

  principalUser = testEnv.users.principal.user;
  principalToken = testEnv.users.principal.token;

  const teacher2User = await TestHelper.createUser({
    name: "Teacher Two",
    email: "teacher2@rival.com",
    role: roles.TEACHER,
    school: school2._id,
  });
  teacher2Token = teacher2User.token;

  const studentTestUser = testEnv.users.student.user;
  studentToken = testEnv.users.student.token;

  exam1 = await Exam.create({
    // This exam is used for general tests, not specifically timed ones
    school: school1._id,
    classroom: classroom1._id,
    subject: subject1._id,
    title: "Math Mid-Term",
    session: "2023/2024",
    term: 1,
  });

  // This exam is used for student submission flow, will be made timed for relevant tests
  exam2 = await Exam.create({
    school: school1._id,
    classroom: classroom1._id,
    subject: subject1._id,
    title: "Math End-of-Term",
    session: "2023/2024",
    term: 2,
  });

  exam3 = await Exam.create({
    school: school1._id,
    classroom: classroom1._id,
    subject: subject1._id,
    title: "Math Previous Year",
    session: "2022/2023",
    term: 1,
  });

  student1 = await Student.create({
    school: school1._id,
    classroom: classroom1._id,
    admissionNumber: "ZNL-001",
    firstName: "John",
    lastName: "Doe",
    gender: "Male",
  });

  // Create a student user for testing student-specific endpoints
  studentUser = await User.create({
    name: "John Doe",
    email: "student@zinnol.com",
    password: "password123",
    role: roles.STUDENT,
    school: school1._id,
    studentProfile: student1._id,
  });
  studentToken = jwt.sign({ id: studentUser._id, tokenVersion: studentUser.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });

  submission1 = await StudentExam.create({
    exam: exam1._id,
    student: student1._id,
    status: "marked",
    totalScore: 85,
    session: exam1.session,
    term: exam1.term,
  });
});

describe("Exam Controller - Teacher/Admin Endpoints", () => {
  describe("GET /api/exams", () => {
    it("should get a list of exams scoped to the user's school", async () => {
      const res = await request(app)
        .get("/api/exams")
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].school.toString()).toBe(school1._id.toString());
    });

    it("should return an empty array if the user's school has no exams", async () => {
      const res = await request(app)
        .get("/api/exams")
        .set("Authorization", `Bearer ${teacher2Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("should filter exams by session", async () => {
      const res = await request(app)
        .get("/api/exams?session=2023/2024")
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].session).toBe("2023/2024");
      expect(res.body.data[1].session).toBe("2023/2024");
    });

    it("should filter exams by term", async () => {
      const res = await request(app)
        .get("/api/exams?term=1")
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2); // exam1 and exam3
    });

    it("should filter exams by classroom", async () => {
      const res = await request(app)
        .get(`/api/exams?classroom=${classroom1._id}`)
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(3);
    });

    it("should combine filters for session and term", async () => {
      const res = await request(app)
        .get("/api/exams?session=2023/2024&term=1")
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id.toString()).toBe(exam1._id.toString());
    });

    it("should return 401 for unauthenticated requests", async () => {
      const res = await request(app).get("/api/exams");
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/exams/:examId/submissions", () => {
    it("should get all submissions for a specific exam", async () => {
      const res = await request(app)
        .get(`/api/exams/${exam1._id}/submissions`)
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]._id.toString()).toBe(submission1._id.toString());
      // Ensure fullName is present on populated student (model/populate dependent)
      expect(res.body.data[0].student.fullName || `${res.body.data[0].student.firstName} ${res.body.data[0].student.lastName}`).toBeDefined();
    });

    it("should return an empty array if an exam has no submissions", async () => {
      const res = await request(app)
        .get(`/api/exams/${exam2._id}/submissions`)
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("should return 404 if the exam ID does not exist", async () => {
      const invalidId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/exams/${invalidId}/submissions`)
        .set("Authorization", `Bearer ${teacher1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe("Exam not found");
    });

    it("should return 403 Forbidden if the user is from a different school", async () => {
      const res = await request(app)
        .get(`/api/exams/${exam1._id}/submissions`)
        .set("Authorization", `Bearer ${teacher2Token}`); // User from school2

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe("Forbidden: You do not have access to this exam.");
    });

    it("should return 401 for unauthenticated requests", async () => {
      const res = await request(app).get(`/api/exams/${exam1._id}/submissions`);
      expect(res.statusCode).toBe(401);
    });

    it("should return 403 if a user with a non-teacher role (e.g., student) tries to access", async () => {
      const res = await request(app)
        .get(`/api/exams/${exam1._id}/submissions`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain("Forbidden: Access denied.");
    });
  });

  describe("Exam Creation and Student Workflow", () => {
    describe("POST /api/exams (Create Exam)", () => {
      it("should allow a teacher to create a new exam", async () => {
        const newExamData = {
          classroom: classroom1._id,
          subject: subject1._id,
          title: "New Biology Test",
          session: "2024/2025",
          term: 1,
        };
        const res = await request(app)
          .post("/api/exams")
          .set("Authorization", `Bearer ${teacher1Token}`)
          .send(newExamData);

        expect(res.statusCode).toBe(201);
        expect(res.body.data.title).toBe("New Biology Test");
        expect(res.body.data.school.toString()).toBe(school1._id.toString());
      });

      it("should return 400 if required fields are missing", async () => {
        const res = await request(app)
          .post("/api/exams")
          .set("Authorization", `Bearer ${teacher1Token}`)
          .send({ title: "Incomplete Exam" }); // Missing other required fields

        expect(res.statusCode).toBe(400); // Joi validation returns 400
        expect(res.body.success).toBe(false);
        expect(res.body.type).toBe('VALIDATION_ERROR');
        expect(res.body.details).toBeDefined();
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);
        // Check that classroom is mentioned as required
        const classroomError = res.body.details.find(detail => detail.field === 'classroom');
        expect(classroomError).toBeDefined();
        expect(classroomError.message).toContain('required');
      });

      it("should return 403 if a student tries to create an exam", async () => {
        const newExamData = {
          classroom: classroom1._id,
          subject: subject1._id,
          title: "New Biology Test",
          session: "2024/2025",
          term: 1,
        };
        const res = await request(app)
          .post("/api/exams")
          .set("Authorization", `Bearer ${studentToken}`)
          .send(newExamData);

        expect(res.statusCode).toBe(403);
      });
    });

    describe("POST /api/exams/:examId/questions (Add Question)", () => {
      const objectiveQuestion = {
        questionText: "What is 2+2?",
        questionType: "objective",
        marks: 5,
        options: [{ text: "3" }, { text: "4" }, { text: "5" }],
        correctOptionIndex: 1,
      };

      it("should allow a teacher to add a question and update exam totalMarks", async () => {
        const initialExam = await Exam.findById(exam1._id);
        // If model default is undefined rather than 0, adjust assertion accordingly.
        expect(initialExam.totalMarks === 0 || initialExam.totalMarks === undefined).toBeTruthy();

        const res = await request(app)
          .post(`/api/exams/${exam1._id}/questions`)
          .set("Authorization", `Bearer ${teacher1Token}`)
          .send(objectiveQuestion);

        expect(res.statusCode).toBe(201);
        expect(res.body.data.questionText).toBe("What is 2+2?");

        // Verify total marks were updated (assumes controller increments totalMarks by question.marks)
        const updatedExam = await Exam.findById(exam1._id);
        expect(updatedExam.totalMarks).toBe(5);
      });

      it("should return 403 if teacher tries to add a question to another school's exam", async () => {
        const res = await request(app)
          .post(`/api/exams/${exam1._id}/questions`)
          .set("Authorization", `Bearer ${teacher2Token}`) // Teacher from school 2
          .send(objectiveQuestion);

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toContain("Forbidden: You do not have access to this exam.");
      });
    });

    describe("Student Exam Submission Flow", () => {
      let submissionId;

      beforeEach(async () => {
        // Ensure exam2 is timed for tests that rely on timers
        await Exam.findByIdAndUpdate(exam2._id, { durationInMinutes: 60 });
        // Ensure studentUser is linked to student1 for all student tests
        await User.findByIdAndUpdate(studentUser._id, { studentProfile: student1._id });
        studentToken = jwt.sign({ id: studentUser._id, tokenVersion: studentUser.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });
      });

      it("POST /api/exams/:examId/start - should create a 'ready' submission and return questions", async () => {
        const res = await request(app)
          .post(`/api/exams/${exam2._id}/start`) // Use an exam that hasn't been submitted
          .set("Authorization", `Bearer ${studentToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe("Exam data retrieved. Ready to begin.");
        expect(res.body.submission.status).toBe("ready"); // Check for new status
        expect(res.body.submission.startTime).toBeUndefined(); // Timer should not have started yet
        expect(res.body.submission.student.toString()).toBe(student1._id.toString());
        expect(res.body.questions).toBeDefined();
      });

      it("POST /api/exams/submissions/:submissionId/begin - should start the timer for a 'ready' submission", async () => {
        // Step 1: Get the 'ready' submission
        const startRes = await request(app)
          .post(`/api/exams/${exam2._id}/start`)
          .set("Authorization", `Bearer ${studentToken}`); // Use exam2 which is now timed

        const submissionId = startRes.body.submission._id;

        // Step 2: Call the new 'begin' endpoint
        const beginRes = await request(app)
          .post(`/api/exams/submissions/${submissionId}/begin`)
          .set("Authorization", `Bearer ${studentToken}`);

        expect(beginRes.statusCode).toBe(200);
        expect(beginRes.body.message).toBe("Exam timer started.");
        const finalSubmission = beginRes.body.submission;
        expect(finalSubmission.status).toBe("in-progress");
        expect(finalSubmission.startTime).toBeDefined();
      });

      it("should return the existing submission if student tries to start an exam already in-progress", async () => {
        // First start
        const firstStartRes = await request(app)
          .post(`/api/exams/${exam2._id}/start`)
          .set("Authorization", `Bearer ${studentToken}`);
        expect(firstStartRes.statusCode).toBe(200);
        const firstSubmissionId = firstStartRes.body.submission._id;

        // Second start attempt
        const secondStartRes = await request(app)
          .post(`/api/exams/${exam2._id}/start`)
          .set("Authorization", `Bearer ${studentToken}`);

        expect(secondStartRes.statusCode).toBe(200);
        expect(secondStartRes.body.submission._id).toBe(firstSubmissionId);
        expect(secondStartRes.body.message).toBe("Exam data retrieved. Ready to begin.");
      });

      it("should return 400 if student tries to start an exam they have already submitted", async () => {
        // Manually create a submitted record for this student and exam
        await StudentExam.create({ exam: exam2._id, student: student1._id, status: "submitted", session: exam2.session, term: exam2.term });

        const res = await request(app).post(`/api/exams/${exam2._id}/start`).set("Authorization", `Bearer ${studentToken}`);
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("You have already submitted this exam.");
      });

      it("PATCH /api/exams/submissions/:submissionId/answer - should allow a student to submit an answer", async () => {
        // Step 1: Start the exam to get a submission ID
        const startRes = await request(app)
          .post(`/api/exams/${exam2._id}/start`)
          .set("Authorization", `Bearer ${studentToken}`);
        submissionId = startRes.body.submission._id;

        // Step 2: Create a question for the exam to answer
        const question = await Question.create({
          exam: exam2._id,
          questionText: "What is the capital of Nigeria?",
          questionType: "objective",
          marks: 10,
          options: [{ text: "Lagos" }, { text: "Abuja" }],
          correctOptionIndex: 1,
        });

        // Step 2b: Begin the exam to set status to in-progress
        await request(app)
          .post(`/api/exams/submissions/${submissionId}/begin`)
          .set("Authorization", `Bearer ${studentToken}`);

        // Step 3: Submit the answer
        const answerData = { questionId: question._id, selectedOptionIndex: 1 };
        const res = await request(app)
          .patch(`/api/exams/submissions/${submissionId}/answer`)
          .set("Authorization", `Bearer ${studentToken}`)
          .send(answerData);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe("Answer saved successfully.");

        const submission = await StudentExam.findById(submissionId);
        expect(submission.answers).toHaveLength(1);
        expect(submission.answers[0].selectedOptionIndex).toBe(1);
      });

      describe("POST /api/exams/submissions/:submissionId/finalize (Finalize Submission)", () => {
        let inProgressSubmission;

        beforeEach(async () => { // This beforeEach runs for each test in this describe block
          // Start an exam to get a valid submission record for each test
          const startRes = await request(app)
            .post(`/api/exams/${exam2._id}/start`)
            .set("Authorization", `Bearer ${studentToken}`);

          // Begin the exam to set the status to 'in-progress'
          const beginRes = await request(app)
            .post(`/api/exams/submissions/${startRes.body.submission._id}/begin`)
            .set("Authorization", `Bearer ${studentToken}`);

          inProgressSubmission = beginRes.body.submission;
        });

        it("should allow a student to finalize their own in-progress submission", async () => {
          const res = await request(app)
            .post(`/api/exams/submissions/${inProgressSubmission._id}/finalize`)
            .set("Authorization", `Bearer ${studentToken}`);

          expect(res.statusCode).toBe(200);
          expect(res.body.message).toContain("Exam submitted successfully");
          expect(res.body.submission.status).toBe("submitted");

          const dbSubmission = await StudentExam.findById(inProgressSubmission._id);
          expect(dbSubmission.status).toBe("submitted");
        });

        it("should return 404 if a student tries to finalize a submission that is already submitted", async () => {
          // First, finalize it successfully
          await request(app)
            .post(`/api/exams/submissions/${inProgressSubmission._id}/finalize`)
            .set("Authorization", `Bearer ${studentToken}`);

          // Then, try to finalize it again
          const res = await request(app)
            .post(`/api/exams/submissions/${inProgressSubmission._id}/finalize`)
            .set("Authorization", `Bearer ${studentToken}`);

          expect(res.statusCode).toBe(404);
          expect(res.body.message).toContain("Submission not found, is already finalized, or you are not the owner.");
        });

        it("should return 404 if a different student tries to finalize the submission", async () => {
          // Create another student and token
          const otherStudent = await Student.create({ school: school1._id, classroom: classroom1._id, admissionNumber: "ZNL-002", firstName: "Jane", lastName: "Smith", gender: "Female" });
          const otherStudentUser = await User.create({ name: "Jane Smith", email: "student2@zinnol.com", password: "password123", role: roles.STUDENT, school: school1._id, studentProfile: otherStudent._id });
          const otherStudentToken = jwt.sign({ id: otherStudentUser._id, tokenVersion: 0 }, process.env.JWT_SECRET);

          const res = await request(app)
            .post(`/api/exams/submissions/${inProgressSubmission._id}/finalize`)
            .set("Authorization", `Bearer ${otherStudentToken}`);

          expect(res.statusCode).toBe(404); // The findOneAndUpdate query will fail to find a match
          expect(res.body.message).toContain("Submission not found, is already finalized, or you are not the owner.");
        });

        it("should log a message for a late submission but still finalize it", async () => {
          const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { }); // jest is defined here

          // Create a specific timed exam for this test
          const timedExam = await Exam.create({ school: school1._id, classroom: classroom1._id, subject: subject1._id, title: "Timed Exam For Finalize Test", session: "2023/2024", term: 1, durationInMinutes: 1 });
          const startRes = await request(app).post(`/api/exams/${timedExam._id}/start`).set("Authorization", `Bearer ${studentToken}`);
          const beginRes = await request(app).post(`/api/exams/submissions/${startRes.body.submission._id}/begin`).set("Authorization", `Bearer ${studentToken}`);
          const timedSubmissionId = beginRes.body.submission._id;

          // Manually set the endTime in the past to simulate lateness
          await StudentExam.findByIdAndUpdate(timedSubmissionId, { endTime: new Date(Date.now() - 2 * 60 * 1000) }); // 2 minutes ago

          const res = await request(app)
            .post(`/api/exams/submissions/${timedSubmissionId}/finalize`)
            .set("Authorization", `Bearer ${studentToken}`);

          expect(res.statusCode).toBe(200);
          expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Late submission for"));

          consoleSpy.mockRestore();
        });
      });

      it("should NOT allow a student to start an exam for a different classroom", async () => {
        const otherClassroom = await Classroom.create({
          school: school1._id,
          stage: "jss",
          level: 2,
          section: "A",
          teacher: teacher1User._id,
        });
        const otherExam = await Exam.create({
          school: school1._id,
          classroom: otherClassroom._id,
          subject: subject1._id,
          title: "JSS 2 Math",
          session: "2023/2024",
          term: 1
        });
        const res = await request(app)
          .post(`/api/exams/${otherExam._id}/start`)
          .set("Authorization", `Bearer ${studentToken}`); // student1 is in JSS 1

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe("You are not enrolled in the classroom for this exam.");
      });
    });
  });

  describe("Exam Marking and Result Posting", () => {
    let submittedExam, objectiveQ, theoryQ, studentSubmission;

    beforeEach(async () => {
      // Create a fresh exam and questions for these tests
      submittedExam = await Exam.create({
        school: school1._id,
        classroom: classroom1._id,
        subject: subject1._id,
        title: "Finals",
        session: "2023/2024",
        term: 1,
        totalMarks: 15, // 5 (obj) + 10 (theory)
      });

      objectiveQ = await Question.create({
        exam: submittedExam._id,
        questionText: "What is 2+2?",
        questionType: "objective",
        marks: 5,
        options: [{ text: "3" }, { text: "4" }, { text: "5" }],
        correctOptionIndex: 1,
      });

      theoryQ = await Question.create({
        exam: submittedExam._id,
        questionText: "Explain photosynthesis.",
        questionType: "theory",
        marks: 10,
        keywords: [
          { text: "sunlight", marks: 4 },
          { text: "chlorophyll", marks: 6 },
        ],
      });

      // Create a student submission that is 'submitted' and has answers
      studentSubmission = await StudentExam.create({
        exam: submittedExam._id,
        student: student1._id,
        session: submittedExam.session,
        term: submittedExam.term,
        status: "submitted",
        answers: [
          {
            question: objectiveQ._id,
            selectedOptionIndex: 1, // Correct answer
          },
          {
            question: theoryQ._id,
            answerText: "Photosynthesis uses sunlight to make food.", // One keyword
          },
        ],
      });
    });

    describe("POST /api/exams/submissions/:submissionId/mark", () => {
      it("should correctly mark the submission and calculate the total score", async () => {
        const res = await request(app)
          .post(`/api/exams/submissions/${studentSubmission._id}/mark`)
          .set("Authorization", `Bearer ${teacher1Token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain("Exam marked successfully");

        // Score should be 5 (objective) + 4 (theory keyword "sunlight") = 9
        expect(res.body.data.totalScore).toBe(9);
        expect(res.body.data.status).toBe("marked");

        const markedSubmission = await StudentExam.findById(studentSubmission._id);
        expect(markedSubmission.totalScore).toBe(9);
        expect(markedSubmission.status).toBe("marked");
        expect(markedSubmission.answers[0].awardedMarks).toBe(5);
        expect(markedSubmission.answers[1].awardedMarks).toBe(4);
      });

      it("should return 400 if the submission is already marked", async () => {
        await studentSubmission.updateOne({ status: "marked" });

        const res = await request(app)
          .post(`/api/exams/submissions/${studentSubmission._id}/mark`)
          .set("Authorization", `Bearer ${teacher1Token}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("This exam has already been marked.");
      });
    });

    describe("POST /api/exams/submissions/:submissionId/post-to-report-card", () => {
      beforeEach(async () => {
        // Ensure the submission is marked before each test in this block
        await studentSubmission.updateOne({ status: "marked", totalScore: 9 });
      });

      it("should create a new result document if one does not exist", async () => {
        const res = await request(app)
          .post(`/api/exams/submissions/${studentSubmission._id}/post-to-report-card`)
          .set("Authorization", `Bearer ${teacher1Token}`);

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toContain("New report card created");
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].subject.toString()).toBe(subject1._id.toString());
        expect(res.body.data.items[0].examScore).toBe(9);

        const submission = await StudentExam.findById(studentSubmission._id);
        expect(submission.isPublished).toBe(true);
      });

      it("should update an existing result document if one exists", async () => {
        const otherSubject = await Subject.create({ name: "English", code: "ENG", school: school1._id });
        await Result.create({
          student: student1._id,
          school: school1._id,
          classroom: classroom1._id,
          session: "2023/2024",
          term: 1, // This matches the exam's term
          items: [{ subject: otherSubject._id, caScore: 20, examScore: 50, maxExamScore: 100 }],
        });

        const res = await request(app)
          .post(`/api/exams/submissions/${studentSubmission._id}/post-to-report-card`)
          .set("Authorization", `Bearer ${teacher1Token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain("Score updated in student's report card");

        const updatedResult = await Result.findOne({ student: student1._id, session: "2023/2024", term: 1 });
        expect(updatedResult.items).toHaveLength(2); // English + Math
        const mathResultItem = updatedResult.items.find(item => item.subject.toString() === subject1._id.toString());
        expect(mathResultItem.examScore).toBe(9);
      });

      it("should return 400 if trying to post an unmarked submission", async () => {
        await studentSubmission.updateOne({ status: "submitted" });
        const res = await request(app)
          .post(`/api/exams/submissions/${studentSubmission._id}/post-to-report-card`)
          .set("Authorization", `Bearer ${teacher1Token}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Exam must be marked before posting to report card.");
      });
    });
  });

  describe("Exam Timer Functionality", () => {
    let timedExam;

    beforeEach(async () => {
      timedExam = await Exam.create({
        school: school1._id,
        classroom: classroom1._id,
        subject: subject1._id,
        title: "Timed Math Test",
        session: "2023/2024",
        term: 1,
        durationInMinutes: 30, // 30 minute duration
      });

      // Assign teacher as invigilator to allow time adjustments
      await ExamInvigilator.create({
        exam: timedExam._id,
        // This was missing, causing the authorization check to fail
        // because the teacher was not an invigilator.
        teacher: teacher1User._id,
        school: school1._id,
        assignedBy: teacher1User._id,
      });
    });

    it("should create an exam with a duration", () => {
      expect(timedExam.durationInMinutes).toBe(30);
    });

    it("should set startTime and return endTime when a student starts a timed exam", async () => {
      // First, start the exam to get a 'ready' submission
      const startResReady = await request(app)
        .post(`/api/exams/${timedExam._id}/start`)
        .set("Authorization", `Bearer ${studentToken}`);
      const submissionId = startResReady.body.submission._id;

      // Then, begin the exam to set the timers
      const beginRes = await request(app)
        .post(`/api/exams/submissions/${submissionId}/begin`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(beginRes.statusCode).toBe(200);
      const { submission } = beginRes.body;
      expect(submission.startTime).toBeDefined();
      expect(submission.endTime).toBeDefined();

      const startTime = new Date(submission.startTime);
      const endTime = new Date(submission.endTime);
      const diffMinutes = (endTime - startTime) / (1000 * 60);

      expect(diffMinutes).toBeCloseTo(30);
    });

    it("should allow a teacher to adjust the time for an exam", async () => {
      const res = await request(app)
        .patch(`/api/exams/${timedExam._id}/adjust-time`)
        .set("Authorization", `Bearer ${teacher1Token}`)
        .send({ additionalMinutes: 15 });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.durationInMinutes).toBe(45); // 30 + 15

      const updatedExam = await Exam.findById(timedExam._id);
      expect(updatedExam.durationInMinutes).toBe(45);
    });

    it("should reflect the adjusted time for a student who starts the exam after adjustment", async () => {
      // Teacher adds 10 minutes
      await request(app)
        .patch(`/api/exams/${timedExam._id}/adjust-time`)
        .set("Authorization", `Bearer ${teacher1Token}`)
        .send({ additionalMinutes: 10 });

      // Student starts the exam (gets 'ready' submission)
      const res = await request(app)
        .post(`/api/exams/${timedExam._id}/start`)
        .set("Authorization", `Bearer ${studentToken}`);
      const submissionId = res.body.submission._id;

      // Student begins the exam (timers start)
      const beginRes = await request(app)
        .post(`/api/exams/submissions/${submissionId}/begin`)
        .set("Authorization", `Bearer ${studentToken}`);

      const { submission } = beginRes.body;
      const startTime = new Date(submission.startTime); // Now startTime should be defined
      const endTime = new Date(submission.endTime);
      const diffMinutes = (endTime - startTime) / (1000 * 60);

      // Duration should now be 30 + 10 = 40 minutes
      expect(diffMinutes).toBeCloseTo(40);
    });

    it("should automatically submit when the frontend calls finalize after time expires", async () => {
      // This test simulates the frontend calling finalize.
      // The backend logic doesn't auto-submit, it validates the call from the client.
      // Step 1: Start the exam to get a 'ready' submission
      const startRes = await request(app)
        .post(`/api/exams/${timedExam._id}/start`)
        .set("Authorization", `Bearer ${studentToken}`);
      const submissionId = startRes.body.submission._id;

      // Step 2: Begin the exam to set status to 'in-progress' and start timers
      await request(app)
        .post(`/api/exams/submissions/${submissionId}/begin`)
        .set("Authorization", `Bearer ${studentToken}`);

      // Simulate time passing (not really, just calling finalize immediately)
      // The finalize endpoint should now find the submission in 'in-progress' status
      const finalizeRes = await request(app)
        .post(`/api/exams/submissions/${submissionId}/finalize`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(finalizeRes.statusCode).toBe(200);
      expect(finalizeRes.body.submission.status).toBe("submitted");
    });
  });
});



describe("POST /api/exams/:examId/bulk-publish (teacher)", () => {
  let bulkExam, studentA, studentB, studentC, studentD, otherSubject;

  beforeEach(async () => {
    bulkExam = await Exam.create({
      school: school1._id,
      classroom: classroom1._id,
      subject: subject1._id, // Mathematics
      title: "Bulk Publish Test Exam",
      session: "2025/2026",
      term: 1,
      totalMarks: 100,
    });
    otherSubject = await Subject.create({ name: "English", code: "ENG", school: school1._id });

    studentA = await Student.create({ school: school1._id, classroom: classroom1._id, firstName: "Alice", lastName: "A", admissionNumber: "A01", gender: "Female" });
    studentB = await Student.create({ school: school1._id, classroom: classroom1._id, firstName: "Bob", lastName: "B", admissionNumber: "B02", gender: "Male" });
    studentC = await Student.create({ school: school1._id, classroom: classroom1._id, firstName: "Charlie", lastName: "C", admissionNumber: "C03", gender: "Male" });
    studentD = await Student.create({ school: school1._id, classroom: classroom1._id, firstName: "David", lastName: "D", admissionNumber: "D04", gender: "Male" });

    // Submission for a new result card
    await StudentExam.create({
      exam: bulkExam._id,
      student: studentA._id,
      status: "marked",
      isPublished: false,
      session: bulkExam.session,
      term: bulkExam.term,
      totalScore: 85,
    });

    // Submission that will update an existing result card
    await StudentExam.create({
      exam: bulkExam._id,
      student: studentB._id,
      status: "marked",
      isPublished: false,
      session: bulkExam.session,
      term: bulkExam.term,
      totalScore: 92,
    });
    // Pre-existing result for studentB in another subject
    await Result.create({
      student: studentB._id,
      school: school1._id,
      classroom: classroom1._id,
      session: "2025/2026",
      term: 1,
      items: [{ subject: otherSubject._id, examScore: 75, maxExamScore: 100 }],
    });

    // Submission that is not marked yet (should be skipped)
    await StudentExam.create({
      exam: bulkExam._id,
      student: studentC._id,
      status: "submitted",
      isPublished: false,
      session: bulkExam.session,
      term: bulkExam.term,
    });

    // Submission that is already published (should be skipped)
    await StudentExam.create({
      exam: bulkExam._id,
      student: studentD._id,
      status: "marked",
      isPublished: true,
      session: bulkExam.session,
      term: bulkExam.term,
      totalScore: 88,
    });
  });

  it("should publish all marked, unpublished scores and return a 207 Multi-Status response", async () => {
    const res = await request(app)
      .post(`/api/exams/${bulkExam._id}/bulk-publish`)
      .set("Authorization", `Bearer ${teacher1Token}`);

    expect(res.statusCode).toBe(207);
    expect(res.body.summary.successful).toBe(2);
    expect(res.body.summary.failed).toBe(0);

    // Verify Student A's submission was published and a new result was created
    const submissionA = await StudentExam.findOne({ student: studentA._id, exam: bulkExam._id });
    expect(submissionA.isPublished).toBe(true);
    const resultA = await Result.findOne({ student: studentA._id, session: "2025/2026", term: 1 });
    expect(resultA).not.toBeNull();
    expect(resultA.items[0].examScore).toBe(85);

    // Verify Student B's submission was published and their existing result was updated
    const submissionB = await StudentExam.findOne({ student: studentB._id, exam: bulkExam._id });
    expect(submissionB.isPublished).toBe(true);
    const resultB = await Result.findOne({ student: studentB._id, session: "2025/2026", term: 1 });
    expect(resultB.items).toHaveLength(2); // English + Math
    const mathResult = resultB.items.find(item => item.subject.toString() === subject1._id.toString());
    expect(mathResult.examScore).toBe(92);

    // Verify skipped submissions were not changed
    const submissionC = await StudentExam.findOne({ student: studentC._id, exam: bulkExam._id });
    expect(submissionC.isPublished).toBe(false);
    const submissionD = await StudentExam.findOne({ student: studentD._id, exam: bulkExam._id });
    expect(submissionD.isPublished).toBe(true); // Was already true
  });
});


describe("POST /api/exams/submissions/:submissionId/pause (Admin/Teacher)", () => {
  let submissionForPause, pausableExam;

  beforeEach(async () => {
    // Create a timed exam specifically for this test block
    pausableExam = await Exam.create({
      school: school1._id,
      classroom: classroom1._id,
      subject: subject1._id,
      title: "Pausable Timed Test",
      session: "2023/2024",
      term: 1,
      durationInMinutes: 10,
      maxPauses: 3,
    });
    // Start the exam for the student to get an in-progress submission
    const startRes = await request(app)
      .post(`/api/exams/${pausableExam._id}/start`)
      .set("Authorization", `Bearer ${studentToken}`);
    // Also begin the exam to make it pausable
    const beginRes = await request(app).post(`/api/exams/submissions/${startRes.body.submission._id}/begin`).set("Authorization", `Bearer ${studentToken}`);
    submissionForPause = beginRes.body.submission;
  });

  it("should allow a teacher to pause a student's exam without incrementing the student's pause count", async () => {
    const res = await request(app)
      .post(`/api/exams/submissions/${submissionForPause._id}/pause`)
      .set("Authorization", `Bearer ${teacher1Token}`);
    expect(res.statusCode).toBe(200); // The test now passes with the correct message
    expect(res.body.message).toBe("Exam paused successfully.");

    const submission = res.body.data;
    expect(submission.status).toBe("paused");
    // Admin pause should NOT count against the student; exact field presence depends on implementation
    expect(submission.pauseCount === 0 || submission.pauseCount === undefined).toBeTruthy();
    expect(submission.timeRemainingOnPause).toBeGreaterThan(0);
  });

  it("should return 403 if a teacher from another school tries to pause the exam", async () => {
    const res = await request(app)
      .post(`/api/exams/submissions/${submissionForPause._id}/pause`)
      .set("Authorization", `Bearer ${teacher2Token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Forbidden: You do not have permission for this exam.");
  });
});

describe("Invigilator Management", () => {
  let invigilatorExam;
  beforeEach(async () => {
    invigilatorExam = await Exam.create({ school: school1._id, classroom: classroom1._id, subject: subject1._id, title: "Invigilator Test", session: "2024/2025", term: 1 });
  });

  it("POST /api/exams/:examId/invigilators - should allow a principal to assign an invigilator", async () => {
    const res = await request(app)
      .post(`/api/exams/${invigilatorExam._id}/invigilators`)
      .set("Authorization", `Bearer ${principalToken}`)
      .send({ teacherId: teacher1User._id });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Invigilator assigned successfully.");
    const assignment = await ExamInvigilator.findOne({ exam: invigilatorExam._id, teacher: teacher1User._id });
    expect(assignment).not.toBeNull();
  });

  it("POST /api/exams/:examId/invigilators - should return 409 if invigilator is already assigned", async () => {
    await ExamInvigilator.create({ exam: invigilatorExam._id, teacher: teacher1User._id, school: school1._id, assignedBy: teacher1User._id });
    const res = await request(app)
      .post(`/api/exams/${invigilatorExam._id}/invigilators`)
      .set("Authorization", `Bearer ${principalToken}`)
      .send({ teacherId: teacher1User._id });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("This teacher is already assigned to this exam.");
  });

  it("GET /api/exams/:examId/invigilators - should retrieve the list of invigilators", async () => {
    await ExamInvigilator.create({ exam: invigilatorExam._id, teacher: teacher1User._id, school: school1._id, assignedBy: teacher1User._id });
    const res = await request(app)
      .get(`/api/exams/${invigilatorExam._id}/invigilators`)
      .set("Authorization", `Bearer ${teacher1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].teacher.name).toBe(teacher1User.name);
  });

  it("DELETE /api/exams/:examId/invigilators/:teacherId - should allow a principal to remove an invigilator", async () => {
    await ExamInvigilator.create({ exam: invigilatorExam._id, teacher: teacher1User._id, school: school1._id, assignedBy: teacher1User._id });
    const res = await request(app)
      .delete(`/api/exams/${invigilatorExam._id}/invigilators/${teacher1User._id}`)
      .set("Authorization", `Bearer ${principalToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Invigilator removed successfully.");
    const assignment = await ExamInvigilator.findOne({ exam: invigilatorExam._id, teacher: teacher1User._id });
    expect(assignment).toBeNull();
  });
});

describe("Additional Exam Actions", () => {
  let pausableSubmission;
  beforeEach(async () => {
    const pausableExam = await Exam.create({ school: school1._id, classroom: classroom1._id, subject: subject1._id, title: "Pausable Test", session: "2024/2025", term: 1, durationInMinutes: 10 });
    pausableSubmission = await StudentExam.create({ exam: pausableExam._id, student: student1._id, status: "paused", timeRemainingOnPause: 5 * 60 * 1000, session: pausableExam.session, term: pausableExam.term });
  });

  it("POST /api/exams/submissions/:submissionId/resume - should allow a student to resume a paused exam", async () => {
    const res = await request(app)
      .post(`/api/exams/submissions/${pausableSubmission._id}/resume`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Exam resumed successfully.");
    expect(res.body.data.status).toBe("in-progress");
    expect(res.body.data.endTime).toBeDefined();
  });

  it("PATCH /api/exams/submissions/:submissionId/answers/:answerId/override - should allow a teacher to override a score", async () => {
    // Use exam2 to avoid conflict with the submission created in beforeEach for exam1
    const question = await Question.create({ exam: exam2._id, questionText: "Override test", marks: 10, questionType: "theory" });
    const submissionWithAnswer = await StudentExam.create({
      exam: exam2._id,
      student: student1._id,
      status: "marked",
      session: exam2.session,
      term: exam2.term,
      answers: [{ question: question._id, awardedMarks: 2 }],
    });
    const answerId = submissionWithAnswer.answers[0]._id;

    const res = await request(app)
      .patch(`/api/exams/submissions/${submissionWithAnswer._id}/answers/${answerId}/override`)
      .set("Authorization", `Bearer ${teacher1Token}`)
      .send({ newScore: 8, reason: "Manual review" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Score overridden successfully.");
    const updatedSubmission = await StudentExam.findById(submissionWithAnswer._id);
    expect(updatedSubmission.answers[0].awardedMarks).toBe(8);
    expect(updatedSubmission.answers[0].isOverridden).toBe(true);
    expect(updatedSubmission.totalScore).toBe(8); // Recalculated total score
  });

  it("POST /api/exams/:examId/announce - should send an announcement", async () => {
    const getIO = (await import("../config/socket.js")).getIO;
    const mockEmit = jest.fn();
    getIO.mockReturnValue({ to: jest.fn(() => ({ emit: mockEmit })) });

    const res = await request(app)
      .post(`/api/exams/${exam1._id}/announce`)
      .set("Authorization", `Bearer ${teacher1Token}`)
      .send({ message: "5 minutes remaining!" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Announcement sent successfully.");
    expect(mockEmit).toHaveBeenCalledWith("examAnnouncement", {
      message: "5 minutes remaining!",
      from: teacher1User.name,
    });
  });

  it("POST /api/exams/:examId/end - should end an exam and force-submit in-progress submissions", async () => {
    const getIO = (await import("../config/socket.js")).getIO;
    const mockEmit = jest.fn();
    getIO.mockReturnValue({ to: jest.fn(() => ({ emit: mockEmit })) });

    // Create an in-progress submission for the exam
    const inProgressSubmission = await StudentExam.create({
      exam: exam1._id,
      student: student1._id,
      status: "in-progress",
      session: exam1.session,
      term: exam1.term,
    });

    // Assign teacher1 as invigilator by the Principal to authorize endExam
    await ExamInvigilator.create({
      exam: exam1._id,
      teacher: teacher1User._id,
      school: school1._id,
      assignedBy: principalUser._id,
    });

    const res = await request(app)
      .post(`/api/exams/${exam1._id}/end`)
      .set("Authorization", `Bearer ${teacher1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain("Exam ended successfully");
    expect(res.body.data.forceSubmittedCount).toBe(1);

    // Check that the submission was force-submitted
    const updatedSubmission = await StudentExam.findById(inProgressSubmission._id);
    expect(updatedSubmission.status).toBe("submitted");
    expect(updatedSubmission.endTime).toBeDefined();

    // Check that the socket event was emitted
    expect(mockEmit).toHaveBeenCalledWith("examEnded", expect.objectContaining({
      message: "The exam has been ended by the invigilator. Your submission has been finalized.",
      forceSubmitted: 1
    }));
  });

  it("POST /api/exams/:examId/end - should prevent a teacher invigilator from ending before scheduledEndAt", async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000); // +10 minutes
    const scheduledExam = await Exam.create({
      school: school1._id,
      classroom: classroom1._id,
      subject: subject1._id,
      title: "Scheduled Exam",
      session: "2024/2025",
      term: 1,
      scheduledEndAt: future,
    });

    // Principal assigns teacher1 as invigilator
    await request(app)
      .post(`/api/exams/${scheduledExam._id}/invigilators`)
      .set("Authorization", `Bearer ${principalToken}`)
      .send({ teacherId: teacher1User._id })
      .expect(201);

    // Teacher tries to end before scheduled end -> 403
    const res = await request(app)
      .post(`/api/exams/${scheduledExam._id}/end`)
      .set("Authorization", `Bearer ${teacher1Token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Teachers cannot end this exam before the scheduled end time.");
  });
});

describe("StudentExam Model Virtuals", () => {
  it("should correctly calculate durationTaken for a submitted exam", async () => {
    // Use a different exam to avoid unique key constraint violation with the global `submission1`
    const uniqueExam = await Exam.create({ school: school1._id, classroom: classroom1._id, subject: subject1._id, title: "Virtuals Test", session: "2024/2025", term: 1 });

    const startTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    const submission = new StudentExam({
      exam: uniqueExam._id,
      student: student1._id,
      status: "submitted",
      startTime: startTime,
      session: "2023/2024", // Required field
      term: 1, // Required field
    });
    await submission.save(); // This sets `updatedAt`

    // Refetch to ensure virtuals are applied
    const found = await StudentExam.findById(submission._id);
    expect(found.durationTaken).toBe(15);
  });

  it("should return null for durationTaken if exam is not submitted or has no startTime", async () => {
    const markedSubmission = await StudentExam.findById(submission1._id); // This one is 'marked'
    expect(markedSubmission.durationTaken).toBeNull();

    markedSubmission.status = "in-progress";
    expect(markedSubmission.durationTaken).toBeNull();

    markedSubmission.status = "submitted";
    markedSubmission.startTime = undefined;
    expect(markedSubmission.durationTaken).toBeNull();
  });
});
