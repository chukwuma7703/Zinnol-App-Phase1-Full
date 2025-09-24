import { jest, describe, it, expect, beforeEach, afterAll, beforeAll } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import StudentExam from "../models/StudentExam.js";
import Exam from "../models/Exam.js";
import Question from "../models/Question.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import Classroom from "../models/Classroom.js";
import AppError from "../utils/AppError.js";

// Mock the socket.io getIO function to prevent errors in a test environment
jest.unstable_mockModule('../config/socket.js', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
  })),
}));

// Dynamically import the service after mocking
const { autoMarkSubmission } = await import("./examMarkerService.js");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe("autoMarkSubmission Service", () => {
  it("should correctly mark a submission with objective and theory questions", async () => {
    // 1. Setup data
    const school = await School.create({ name: "Test School" });
    const classroom = await Classroom.create({ school: school._id, stage: "jss", level: 1, section: "A", teacher: new mongoose.Types.ObjectId() });
    const student = await Student.create({ school: school._id, classroom: classroom._id, firstName: "Test", lastName: "Student", admissionNumber: "123", gender: "Male" });
    const exam = await Exam.create({ school: school._id, classroom: classroom._id, title: "Test Exam", session: "2023/2024", term: 1, subject: new mongoose.Types.ObjectId() });

    const objectiveQ = await Question.create({
      exam: exam._id,
      questionText: "2+2?",
      questionType: "objective",
      marks: 5,
      options: [{ text: "3" }, { text: "4" }, { text: "5" }],
      correctOptionIndex: 1,
    });

    const theoryQ = await Question.create({
      exam: exam._id,
      questionText: "Explain photosynthesis.",
      questionType: "theory",
      marks: 10,
      keywords: [
        { text: "sunlight", marks: 4 },
        { text: "chlorophyll", marks: 6 },
      ],
    });

    const submission = await StudentExam.create({
      exam: exam._id,
      student: student._id,
      session: exam.session,
      term: exam.term,
      status: "submitted",
      answers: [
        {
          question: objectiveQ._id,
          selectedOptionIndex: 1, // Correct answer
        },
        {
          question: theoryQ._id,
          answerText: "Plants use sunlight to make food.", // One keyword
        },
      ],
    });

    // 2. Run the service function
    const markedSubmission = await autoMarkSubmission(submission._id);

    // 3. Assert results
    expect(markedSubmission.status).toBe("marked");
    // Score should be 5 (objective) + 4 (theory keyword "sunlight") = 9
    expect(markedSubmission.totalScore).toBe(9);
    expect(markedSubmission.answers[0].awardedMarks).toBe(5);
    expect(markedSubmission.answers[1].awardedMarks).toBe(4);
  });

  it("should correctly mark a 'fill-in-the-blank' question", async () => {
    // 1. Setup data
    const school = await School.create({ name: "Test School" });
    const classroom = await Classroom.create({ school: school._id, stage: "jss", level: 1, section: "A", teacher: new mongoose.Types.ObjectId() });
    const student = await Student.create({ school: school._id, classroom: classroom._id, firstName: "Test", lastName: "Student", admissionNumber: "123", gender: "Male" });
    const exam = await Exam.create({ school: school._id, classroom: classroom._id, title: "Test Exam", session: "2023/2024", term: 1, subject: new mongoose.Types.ObjectId() });

    const fillInBlankQ = await Question.create({
      exam: exam._id,
      questionText: "The capital of France is ____.",
      questionType: "fill-in-the-blank",
      marks: 7,
      correctAnswers: ["Paris"],
    });

    const submission = await StudentExam.create({
      exam: exam._id,
      student: student._id,
      session: exam.session,
      term: exam.term,
      status: "submitted",
      answers: [
        {
          question: fillInBlankQ._id,
          answerText: "paris ", // Test with different case and trailing space
        },
      ],
    });

    // 2. Run the service function
    const markedSubmission = await autoMarkSubmission(submission._id);

    // 3. Assert results
    expect(markedSubmission.status).toBe("marked");
    expect(markedSubmission.totalScore).toBe(7);
    expect(markedSubmission.answers[0].awardedMarks).toBe(7);
  });

  it("should throw AppError if submission is not found", async () => {
    const invalidId = new mongoose.Types.ObjectId();
    await expect(autoMarkSubmission(invalidId)).rejects.toThrow(AppError);
    await expect(autoMarkSubmission(invalidId)).rejects.toThrow(`Submission with ID ${invalidId} not found.`);
  });

  it("should return the submission without error if status is not 'submitted'", async () => {
    const school = await School.create({ name: "Test School" });
    const classroom = await Classroom.create({ school: school._id, stage: "jss", level: 1, section: "A", teacher: new mongoose.Types.ObjectId() });
    const student = await Student.create({ school: school._id, classroom: classroom._id, firstName: "Test", lastName: "Student", admissionNumber: "123", gender: "Male" });
    const exam = await Exam.create({ school: school._id, classroom: classroom._id, title: "Test Exam", session: "2023/2024", term: 1, subject: new mongoose.Types.ObjectId() });

    const submission = await StudentExam.create({
      exam: exam._id,
      student: student._id,
      session: exam.session,
      term: exam.term,
      status: "in-progress", // Not 'submitted'
      answers: [],
    });

    const result = await autoMarkSubmission(submission._id);
    expect(result.status).toBe("in-progress"); // Status should be unchanged
    expect(result.totalScore).toBe(0); // Score should not be calculated
  });
});
