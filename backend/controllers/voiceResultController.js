import asyncHandler from "express-async-handler";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Result from "../models/Result.js";
import AppError from "../utils/AppError.js";

// Simple fuzzy search helper
function fuzzyMatch(str, arr) {
    str = str.toLowerCase();
    return arr.find(item => item.toLowerCase().includes(str));
}

// Voice-activated result entry controller
export const voiceResultEntry = asyncHandler(async (req, res, next) => {
    const { student, subject, score } = req.body;
    if (!student || !subject || typeof score !== "number") {
        return next(new AppError("Missing student, subject, or score", 400));
    }

    // For testing without authentication, use a mock school ID
    const schoolId = req.user?.school || "507f1f77bcf86cd799439011"; // Mock ObjectId

    // Find student by fuzzy name match
    const students = await Student.find({ school: schoolId });
    const studentNameList = students.map(s => `${s.firstName} ${s.lastName}`);
    const matchedName = fuzzyMatch(student, studentNameList);
    const matchedStudent = students.find(s => `${s.firstName} ${s.lastName}`.toLowerCase() === matchedName?.toLowerCase());
    if (!matchedStudent) return next(new AppError("Student not found", 404));

    // Find subject by fuzzy name match
    const subjects = await Subject.find({ school: schoolId });
    const subjectNameList = subjects.map(s => s.name);
    const matchedSubjectName = fuzzyMatch(subject, subjectNameList);
    const matchedSubject = subjects.find(s => s.name.toLowerCase() === matchedSubjectName?.toLowerCase());
    if (!matchedSubject) return next(new AppError("Subject not found", 404));

    // Create result
    const result = await Result.create({
        student: matchedStudent._id,
        subject: matchedSubject._id,
        score,
        enteredBy: req.user?._id || "507f1f77bcf86cd799439011", // Mock user ID
        entryMethod: "voice",
    });

    res.status(201).json({
        message: `Result recorded for ${matchedStudent.firstName} ${matchedStudent.lastName} in ${matchedSubject.name}: ${score}`,
        result,
    });
});
