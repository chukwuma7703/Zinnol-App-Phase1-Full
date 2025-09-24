import { parseCsvFile, convertToCsv } from "../utils/csvUtils.js";
/**
 * @desc    Bulk import students from a CSV file
 * @route   POST /api/students/bulk-import-csv
 * @access  Private (Admins/Principals)
 */
export const bulkImportStudents = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("No CSV file uploaded.", 400));
  }
  const schoolId = req.user.school;
  const results = await parseCsvFile(req.file.path);
  let imported = 0;
  let errors = [];
  for (const row of results) {
    try {
      if (!row.classroom || !row.admissionNumber || !row.firstName || !row.lastName || !row.gender) {
        errors.push({ row, error: "Missing required fields." });
        continue;
      }
      const cls = await Classroom.findById(row.classroom);
      if (!cls || cls.school.toString() !== schoolId.toString()) {
        errors.push({ row, error: "Classroom not found or does not belong to your school." });
        continue;
      }
      await Student.create({
        school: schoolId,
        classroom: row.classroom,
        admissionNumber: row.admissionNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : undefined,
        hometown: row.hometown,
        stateOfOrigin: row.stateOfOrigin,
        parentEmail: row.parentEmail,
        heightCm: row.heightCm,
      });
      imported++;
    } catch (err) {
      errors.push({ row, error: err.message });
    }
  }
  res.json({ imported, errors });
});

/**
 * @desc    Bulk export students to a CSV file
 * @route   GET /api/students/bulk-export-csv
 * @access  Private (Admins/Principals)
 */
export const bulkExportStudents = asyncHandler(async (req, res, next) => {
  const schoolId = req.user.school;
  const students = await Student.find({ school: schoolId }).lean();
  const fields = [
    "classroom",
    "admissionNumber",
    "firstName",
    "lastName",
    "gender",
    "dateOfBirth",
    "hometown",
    "stateOfOrigin",
    "parentEmail",
    "heightCm",
  ];
  const csv = convertToCsv(students, fields);
  res.header("Content-Type", "text/csv");
  res.attachment("students.csv");
  res.send(csv);
});
import asyncHandler from "express-async-handler";
import Student from "../models/Student.js";
import Classroom from "../models/Classroom.js";
import AppError from "../utils/AppError.js";
import fs from "fs"; // Used for file cleanup on disk storage
import path from "path"; // Used for constructing file paths
import { ocrQueue } from "../queues/ocrQueue.js";

/**
 * Helper function to asynchronously remove an uploaded file on validation failure.
 * This prevents orphaned files from cluttering the server and uses non-blocking I/O.
 * This is only relevant for disk storage strategies.
 * @param {object} req - The Express request object, which may contain a file.
 */
const cleanupUploadedFile = (req) => {
  if (req.file && req.file.path) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error(`Failed to delete temporary upload file: ${req.file.path}`, err);
    }
  }
};

/**
 * @desc    Create a single new student
 * @route   POST /api/students
 * @access  Private (Admins/Principals)
 */
export const createStudent = asyncHandler(async (req, res, next) => {
  const schoolId = req.user.school; // Get school from authenticated user, not request body.
  const {
    classroom,
    admissionNumber,
    firstName,
    lastName,
    gender,
    dateOfBirth,
    hometown,
    stateOfOrigin,
    parentEmail,
    heightCm,
  } = req.body;

  if (!schoolId) {
    cleanupUploadedFile(req);
    return next(new AppError("Your account is not associated with a school.", 403));
  }

  if (!classroom || !admissionNumber || !firstName || !lastName || !gender) {
    cleanupUploadedFile(req);
    return next(new AppError("Classroom, admission number, name, and gender are required.", 400));
  }

  const cls = await Classroom.findById(classroom);
  if (!cls) {
    cleanupUploadedFile(req);
    return next(new AppError("Classroom not found", 404));
  }

  if (cls.school.toString() !== schoolId.toString()) {
    cleanupUploadedFile(req);
    return next(new AppError("Classroom does not belong to your school", 400));
  }

  // Enforce classroom capacity
  if (cls.capacity && cls.studentCount >= cls.capacity) {
    cleanupUploadedFile(req);
    return next(new AppError(`Classroom is full (capacity ${cls.capacity})`, 400));
  }

  const passportUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  const student = await Student.create({
    school: schoolId,
    classroom,
    admissionNumber,
    firstName,
    lastName,
    gender,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    hometown,
    stateOfOrigin,
    parentEmail,
    heightCm,
    passportUrl,
  });

  res.status(201).json(student);
});

/**
 * @desc    Get all students with search and filtering
 * @route   GET /api/students
 * @access  Private (School users)
 */
export const getStudents = asyncHandler(async (req, res, next) => {
  const { classroom, q, page = 1, limit = 10 } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  // Enforce tenancy: Users can only see students in their own school.
  const query = { school: req.user.school };
  if (classroom) query.classroom = classroom;

  if (q) {
    const searchRegex = new RegExp(q, "i");
    query.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { admissionNumber: searchRegex },
    ];
  }

  const students = await Student.find(query)
    .populate("school", "name")
    .populate("classroom", "label")
    .sort({ lastName: 1 })
    .skip(skip).limit(limitNum);
  const total = await Student.countDocuments(query);

  res.status(200).json({
    status: "success",
    message: "Students retrieved successfully.",
    data: { students, page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});


/**
 * @desc    Get a single student by their ID
 * @route   GET /api/students/:id
 * @access  Private (School users)
 */
export const getStudentById = asyncHandler(async (req, res, next) => {
  const student = await Student.findById(req.params.id)
    .populate("school", "name")
    .populate("classroom", "label"); // Changed from 'name' to 'label' to match Classroom model

  if (!student) {
    return next(new AppError("Student not found", 404));
  }

  // Authorization check: Ensure the user belongs to the same school as the student.
  if (student.school._id.toString() !== req.user.school.toString()) {
    return next(new AppError("Forbidden: You do not have permission to view this student.", 403));
  }

  res.json(student);
});

/**
 * @desc    Update a student's details
 * @route   PUT /api/students/:id
 * @access  Private (Admins/Principals)
 */
export const updateStudent = asyncHandler(async (req, res, next) => {
  const student = await Student.findById(req.params.id);

  if (!student) {
    cleanupUploadedFile(req);
    return next(new AppError("Student not found", 404));
  }

  // Authorization check: Ensure the user belongs to the same school as the student.
  if (student.school.toString() !== req.user.school.toString()) {
    cleanupUploadedFile(req);
    return next(new AppError("Forbidden: You do not have permission to update this student.", 403));
  }

  // Update fields from the request body
  Object.assign(student, req.body);

  if (req.file) {
    // If a new passport is uploaded, delete the old one to prevent orphaned files.
    if (student.passportUrl) {
      const oldPath = path.join(process.cwd(), student.passportUrl);
      try {
        fs.unlinkSync(oldPath);
      } catch (err) {
        console.error(`Failed to delete old passport file: ${oldPath}`, err);
      }
    }
    student.passportUrl = `/uploads/${req.file.filename}`;
  }

  const updatedStudent = await student.save();
  res.json(updatedStudent);
});

/**
 * Parses raw text from a class list into structured student data.
 * @param {string} text - The raw text from Tesseract.
 * @returns {{students: Array, errors: Array}}
 */
const parseClassListText = (text) => {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 10);
  const students = [];
  const errors = [];

  const admissionNumberRegex = /[A-Z]{2,}-[\d]+/;

  for (const [index, line] of lines.entries()) {
    const admissionNumberMatch = line.match(admissionNumberRegex);
    const admissionNumber = admissionNumberMatch ? admissionNumberMatch[0] : null;

    // Extract name by removing the admission number
    const name = admissionNumber ? line.replace(admissionNumber, '').trim() : line;

    if (!name || name.split(' ').length < 2) {
      errors.push({ line: index + 1, text: line, message: "Could not parse a valid full name." });
      continue;
    }

    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    students.push({ admissionNumber, firstName, lastName });
  }

  return { students, errors };
};

// @desc    Delete student by ID
// @route   DELETE /api/students/:id
// @access  Private (Admins/Principals)
export const deleteStudent = asyncHandler(async (req, res, next) => {
  const student = await Student.findById(req.params.id);

  if (!student) {
    return next(new AppError("Student not found", 404));
  }

  // Authorization check
  if (student.school.toString() !== req.user.school.toString()) {
    return next(new AppError("Forbidden: You do not have permission to delete this student.", 403));
  }

  await student.deleteOne(); // Use deleteOne to trigger middleware if any
  res.status(200).json({ message: "Student deleted successfully" });
});

/**
 * @desc    Bulk enroll or update students from an OCR scan of a class list.
 * @route   POST /api/students/bulk-from-class-list-ocr
 * @access  Private (Admins/Principals)
 */
export const enrollStudentsFromOCR = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("No image file was uploaded.", 400));
  }
  const { classroomId } = req.body;
  if (!classroomId) {
    // No file cleanup needed here as we are using memory storage (req.file.buffer)
    return next(new AppError("A classroomId is required.", 400));
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    return next(new AppError("Classroom not found.", 404));
  }

  // Authorization check: ensure classroom belongs to user's school
  if (classroom.school.toString() !== req.user.school.toString()) {
    return next(new AppError("Forbidden: This classroom does not belong to your school.", 403));
  }

  // Add job to the queue instead of processing here
  await ocrQueue.add('process-class-list', { imageBuffer: req.file.buffer, classroomId, schoolId: classroom.school, requestedBy: req.user._id });

  res.status(202).json({
    message: "Image received. Processing has started in the background. You will be notified upon completion.",
  });
});
