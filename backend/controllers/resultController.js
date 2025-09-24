import { parseCsvFile, convertToCsv } from "../utils/csvResultUtils.js";
/**
 * @desc    Bulk import results from a CSV file
 * @route   POST /api/results/bulk-import-csv
 * @access  Private (Teachers, Principals, Admins)
 */
export const bulkImportResults = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("No CSV file uploaded.", 400));
  }
  const results = await parseCsvFile(req.file.path);
  let imported = 0;
  let errors = [];
  for (const row of results) {
    try {
      if (!row.student || !row.classroom || !row.session || !row.term || !row.subject || !row.examScore) {
        errors.push({ row, error: "Missing required fields." });
        continue;
      }
      await Result.create({
        student: row.student,
        classroom: row.classroom,
        session: row.session,
        term: row.term,
        items: [{
          subject: row.subject,
          examScore: row.examScore,
          maxExamScore: row.maxExamScore,
          caScore: row.caScore,
          maxCaScore: row.maxCaScore,
        }],
        status: row.status || "pending",
        submittedBy: req.user._id,
        lastUpdatedBy: req.user._id,
      });
      imported++;
    } catch (err) {
      errors.push({ row, error: err.message });
    }
  }
  return ok(res, { imported, errors }, "Bulk import processed");
});

/**
 * @desc    Bulk export results to a CSV file
 * @route   GET /api/results/bulk-export-csv
 * @access  Private (Teachers, Principals, Admins)
 */
export const bulkExportResults = asyncHandler(async (req, res, next) => {
  const results = await Result.find({}).lean();
  const fields = [
    "student",
    "classroom",
    "session",
    "term",
    "items",
    "status",
    "submittedBy",
    "lastUpdatedBy",
  ];
  const csv = convertToCsv(results, fields);
  res.header("Content-Type", "text/csv");
  res.attachment("results.csv");
  res.send(csv);
});
import asyncHandler from "express-async-handler";
import fs from "fs/promises";
import path from "path";
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import Result from "../models/Result.js";
import AnnualResult from "../models/AnnualResult.js";
import Classroom from "../models/Classroom.js";
import Student from "../models/Student.js";
import { roles } from "../middleware/authMiddleware.js";
import { ok, created } from "../utils/ApiResponse.js";
import AppError from "../utils/AppError.js";
import { annualResultQueue } from "../queues/resultQueue.js";


// Helper: recompute positions after result approval
const recomputePositions = async ({ classroom, term, session }) => {
  const results = await Result.find({ classroom, term, session, status: "approved" }) // Find all approved results for the class
    .select("_id student totalScore items") // Select `items` to make them available for the pre-save hook
    .populate("student", "lastName firstName")
    .sort({ totalScore: -1, "student.lastName": 1 });

  let position = 0;
  let lastScore = null;

  const updates = results.map((r, i) => {
    if (r.totalScore !== lastScore) {
      position = i + 1;
      lastScore = r.totalScore;
    }
    r.position = position;
    return r.save();
  });

  await Promise.all(updates);
};

/**
 * Parses raw text from OCR into a structured array of student results.
 * This is designed to be robust against common OCR errors and formatting issues.
 *
 * @param {string} text - The raw text from Tesseract.
 * @param {string[]} subjectOrder - An array of subject ObjectIDs in the order they appear on the sheet.
 * @returns {{results: Array, errors: Array}} - An object containing successfully parsed results and any parsing errors.
 */
const parseOcrText = (text, subjectOrder = []) => {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const results = [];
  const errors = [];

  // A more flexible regex to find an admission number anywhere in the line.
  // Looks for patterns like ZNL-001, ZNL/001, etc.
  const admissionNumberRegex = /\b([A-Z]{2,}[\/-]\d+)\b/;
  // Common OCR character mistakes and their corrections.
  const ocrCorrections = {
    '[oO]': '0', // Letter O -> Number 0
    '[Il]': '1', // Letter I or l -> Number 1
    '[sS]': '5', // Letter S -> Number 5
    '[bB]': '8', // Letter B -> Number 8
    '[gG]': '9', // Letter G -> Number 9
    '[zZ]': '2', // Letter Z -> Number 2
  };

  for (const [index, line] of lines.entries()) {



    const admissionNumberMatch = line.match(admissionNumberRegex);
    // Skip lines that look like headers or don't contain a plausible admission number.
    if (!admissionNumberMatch) {
      if (/subject|name|score|total|position|admission/i.test(line)) {
        continue; // Likely a header, so we skip it silently.
      }
      errors.push({ line: index + 1, text: line, message: "Could not find a valid admission number." });
      continue;
    }

    const admissionNumber = admissionNumberMatch[0];
    const remainingText = line.substring(admissionNumber.length);

    // Isolate the part of the string that contains scores, which is typically after the admission number.
    let scoresText = line.substring(line.indexOf(admissionNumber) + admissionNumber.length);

    // Attempt to extract a name, which usually comes after the admission number and before the scores.
    // This regex looks for 2-4 capitalized words, which is a common name format.
    const nameMatch = scoresText.match(/^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
    const parsedName = nameMatch ? nameMatch[1].trim() : null;

    // If a name was found, the scores are in the text *after* the name.
    if (parsedName) {
      scoresText = scoresText.substring(nameMatch[0].length);
    }

    // Apply all OCR corrections to the scores string.
    for (const [pattern, replacement] of Object.entries(ocrCorrections)) {
      scoresText = scoresText.replace(new RegExp(pattern, 'g'), replacement);
    }

    const numbers = scoresText.match(/\d+/g)?.map(Number);

    if (!numbers || numbers.length < subjectOrder.length * 2) { // Each subject needs a CA and Exam score.
      errors.push({ line: index + 1, admissionNumber, parsedName, message: `Expected at least ${subjectOrder.length * 2} scores, but found only ${numbers?.length || 0}.` });
      continue;
    }

    const items = [];
    for (let i = 0; i < subjectOrder.length; i++) {
      const caScore = numbers[i * 2];
      const examScore = numbers[i * 2 + 1];

      if (caScore === undefined || examScore === undefined) {
        // This break is important to stop processing if we run out of numbers.
        errors.push({ line: index + 1, admissionNumber, parsedName, message: `Incomplete score pair for subject #${i + 1}.` });
        items.length = 0; // Invalidate this student's result
        break;
      }

      items.push({ subject: subjectOrder[i], caScore, examScore });
    }

    if (items.length === subjectOrder.length) {
      results.push({ admissionNumber, parsedName, items });
    }
  }

  return { results, errors };
};

const submitResultsFromOCR = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("No image file was uploaded.", 400));
  }

  const { classroomId, session, term, subjectOrderJSON } = req.body;
  if (!classroomId || !session || !term || !subjectOrderJSON) {
    return next(new AppError("Missing required fields: classroomId, session, term, subjectOrderJSON.", 400));
  }

  let subjectOrder;
  try {
    subjectOrder = JSON.parse(subjectOrderJSON);
    if (!Array.isArray(subjectOrder)) throw new Error();
  } catch (e) {
    return next(new AppError("`subjectOrderJSON` must be a valid JSON array of subject IDs.", 400));
  }

  // 1. Perform OCR
  const worker = await createWorker();
  let text;
  try {
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const processedImageBuffer = await sharp(req.file.buffer).grayscale().sharpen().toBuffer();
    const { data } = await worker.recognize(processedImageBuffer);
    text = data.text;
  } catch (error) {
    // Wrap image processing/OCR errors in an AppError for consistent error handling.
    return next(new AppError(error.message || "Image processing failed", 500));
  } finally {
    await worker.terminate();
  }

  // 2. Parse the OCR text
  const { results: parsedResults, errors: parsingErrors } = parseOcrText(text || "", subjectOrder);

  if (parsedResults.length === 0 && text) {
    return next(new AppError(`OCR parsing failed. No valid student results could be extracted from the image. Please check image quality and format. Diagnostics: ${JSON.stringify(parsingErrors)}`, 400));
  }


  // 3. Bulk create/update results
  const operations = parsedResults.map(async ({ admissionNumber, parsedName, items }) => {
    const student = await Student.findOne({ admissionNumber, classroom: classroomId });
    if (!student) {
      return { admissionNumber, status: "failed", reason: "Student with this admission number was not found in the specified classroom." };

    }
    // Authorization check: Ensure teacher and student are in the same school.
    if (req.user.school.toString() !== student.school.toString()) {
      throw new AppError("Unauthorized: Teacher does not belong to the same school as the student.", 403);
    }

    try {
      const result = await Result.findOneAndUpdate(
        { student: student._id, term, session },
        {
          school: student.school,
          classroom: classroomId,
          student: student._id,
          session,
          term,
          items: items,
          status: "pending",
          submittedBy: req.user._id,
        },
        { upsert: true, new: true, runValidators: true }
      );
      return { admissionNumber, status: "success", resultId: result._id };
    } catch (error) {
      // This will catch validation errors from the Result model's pre-save hook
      return { admissionNumber, status: "failed", reason: `Validation Error: ${error.message}` };
    }
  });

  const processedResults = await Promise.all(operations);

  const summary = {
    successful: processedResults.filter(r => r.status === 'success').length,
    failed: processedResults.filter(r => r.status === 'failed').length,
    parsingErrors: parsingErrors.length,
  };
  return ok(res, { processedResults, parsingErrors }, "OCR bulk submission processed", { summary }, 207);
});


const getGradePoint = (average) => {
  if (average >= 90) return "A+";
  if (average >= 80) return "A";
  if (average >= 70) return "B";
  if (average >= 60) return "C";
  if (average >= 50) return "D";
  if (average >= 40) return "E";
  return "F";
};

const generateAnnualResultsForClassroom = asyncHandler(async (req, res, next) => {
  const { classroomId, session } = req.params;

  // Add the job to the queue
  await annualResultQueue.add('generate-annual-results', {
    classroomId,
    session,
    requestedBy: req.user._id,
  });

  // Immediately respond to the user
  return ok(res, null, "Annual result generation scheduled", undefined, 202);
});

const submitResult = asyncHandler(async (req, res) => {
  const { school, classroom, student, session, term, items } = req.body;

  // Validate classroom & student coherence
  const cls = await Classroom.findById(classroom);
  if (!cls) {
    res.status(404);
    throw new Error("Classroom not found");
  }

  const std = await Student.findById(student);
  if (!std) {
    res.status(404);
    throw new Error("Student not found");
  }

  if (String(std.classroom) !== String(classroom)) {
    res.status(400);
    throw new Error("Student is not in the provided classroom");
  }
  if (String(std.school) !== String(school) || String(cls.school) !== String(school)) {
    res.status(400);
    throw new Error("School mismatch for student/classroom");
  }

  // Upsert draft/pending for (student+term+session)
  let result = await Result.findOne({ student, term, session });
  if (!result) {
    result = new Result({
      school,
      classroom,
      student,
      session,
      term,
      items,
      status: "pending",
      submittedBy: req.user._id,
    });
  } else {
    result.items = items;
    result.status = "pending";
    result.submittedBy = req.user._id;
  }

  await result.save(); // This will trigger the pre-save hook to calculate totalScore
  return created(res, { result }, "Result submitted (pending approval)");
});

const approveResult = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.params.id);
  if (!result) {
    res.status(404);
    throw new Error("Result not found");
  }

  // Prevent re-approving an already approved result.
  if (result.status === "approved") {
    return ok(res, { result }, "Result is already approved.");
  }

  result.status = "approved";
  result.approvedBy = req.user._id;
  result.approvedAt = new Date();
  result.rejectedBy = undefined;
  result.rejectionReason = undefined;
  await result.save();

  await recomputePositions({
    classroom: result.classroom,
    term: result.term,
    session: result.session,
  });

  return ok(res, { result }, "Result approved & positions recomputed");
});

const rejectResult = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || typeof reason !== "string" || reason.trim() === "") {
    res.status(400);
    throw new Error("A reason for rejection is required.");
  }

  const result = await Result.findById(req.params.id);
  if (!result) {
    res.status(404);
    throw new Error("Result not found");
  }

  if (result.status !== "pending") {
    res.status(400);
    throw new Error(`Cannot reject a result with status "${result.status}". Only pending results can be rejected.`);
  }

  result.status = "rejected";
  result.rejectionReason = reason;
  result.rejectedBy = req.user._id;
  result.approvedBy = undefined;
  result.approvedAt = undefined;
  await result.save();

  return ok(res, { result }, "Result has been rejected.");
});


const getStudentResults = asyncHandler(async (req, res) => {
  const { session, term } = req.query;
  const q = { student: req.params.studentId };
  if (session) q.session = session;
  if (term) q.term = Number(term);

  if ([roles.PARENT, roles.STUDENT].includes(req.user.role)) {
    q.status = "approved";
  }

  const results = await Result.find(q).populate("items.subject", "name code");
  return ok(res, { results }, "Student results fetched");
});

const getAllResults = asyncHandler(async (req, res) => {
  // Authorization: only high-privilege roles
  const allowed = [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL, roles.VICE_PRINCIPAL];
  if (!allowed.includes(req.user.role)) {
    res.status(403);
    throw new Error("Forbidden: insufficient role to list all results");
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const skip = (page - 1) * limit;

  // School scoping for non-global roles
  const baseFilter = (req.user.role === roles.GLOBAL_SUPER_ADMIN) ? {} : { school: req.user.school };

  const total = await Result.countDocuments(baseFilter);
  const results = await Result.find(baseFilter)
    .populate("student", "firstName lastName")
    .populate("classroom", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const meta = { page, pages: Math.ceil(total / limit), total, limit };
  return ok(res, { results }, "Results list", meta);
});

/**
 * @desc    Upload a voice note for a result sheet
 * @route   POST /api/results/:resultId/voice-note
 * @access  Protected (Teacher, Principal)
 */
const uploadVoiceNote = asyncHandler(async (req, res, next) => {
  const { resultId } = req.params;
  const userRole = req.user.role;

  if (!req.file) {
    return next(new AppError("No voice note file uploaded.", 400));
  }

  const result = await Result.findById(resultId);

  if (!result) {
    return next(new AppError("Result sheet not found.", 404));
  }

  // Authorization: Ensure user's school matches the result's school
  if (req.user.school.toString() !== result.school.toString()) {
    return next(new AppError("Forbidden: You do not have permission for this result sheet.", 403));
  }

  // Prevent overwriting an existing voice note
  if (userRole === roles.TEACHER && result.teacherVoiceNoteUrl) {
    return next(new AppError("A teacher voice note already exists. It cannot be replaced.", 409)); // 409 Conflict
  }
  if (userRole === roles.PRINCIPAL && result.principalVoiceNoteUrl) {
    return next(new AppError("A principal voice note already exists. It cannot be replaced.", 409));
  }

  const voiceNoteUrl = `/uploads/voice-notes/${req.file.filename}`;

  // Update the correct field based on the user's role
  if (userRole === roles.TEACHER) {
    result.teacherVoiceNoteUrl = voiceNoteUrl;
  } else if (userRole === roles.PRINCIPAL) {
    result.principalVoiceNoteUrl = voiceNoteUrl;
  }

  await result.save();

  return ok(res, { resultId: result._id, voiceNoteUrl }, "Voice note uploaded and linked successfully.");
});

/**
 * @desc    Deletes a voice note from a result sheet, if the result is still pending.
 * @route   DELETE /api/results/:resultId/voice-note
 * @access  Protected (Teacher, Principal)
 */
const deleteVoiceNote = asyncHandler(async (req, res, next) => {
  const { resultId } = req.params;
  const userRole = req.user.role;

  const result = await Result.findById(resultId);

  if (!result) {
    return next(new AppError("Result sheet not found.", 404));
  }

  // Authorization check
  if (req.user.school.toString() !== result.school.toString()) {
    return next(new AppError("Forbidden: You do not have permission for this result sheet.", 403));
  }

  // Business logic: Cannot delete if result is no longer pending
  if (result.status !== "pending") {
    return next(new AppError("Cannot delete voice note after result has been approved or published.", 403));
  }

  let voiceNoteUrlToDelete;
  let fieldToUpdate;

  if (userRole === roles.TEACHER && result.teacherVoiceNoteUrl) {
    voiceNoteUrlToDelete = result.teacherVoiceNoteUrl;
    fieldToUpdate = "teacherVoiceNoteUrl";
  } else if (userRole === roles.PRINCIPAL && result.principalVoiceNoteUrl) {
    voiceNoteUrlToDelete = result.principalVoiceNoteUrl;
    fieldToUpdate = "principalVoiceNoteUrl";
  } else {
    return next(new AppError("No voice note found for your role to delete.", 404));
  }

  // Delete the physical file
  if (voiceNoteUrlToDelete) {
    const filename = path.basename(voiceNoteUrlToDelete);
    const filePath = path.join(process.cwd(), "uploads", "voice-notes", filename);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // If the file doesn't exist (ENOENT), we can ignore the error,
      // as the desired state (file is gone) is achieved.
      // We only log other, unexpected errors.
      if (err.code !== 'ENOENT') {
        console.error(`Failed to delete voice note file: ${filePath}`, err);
      }
    }
  }

  result[fieldToUpdate] = undefined;
  await result.save();

  return ok(res, null, "Voice note deleted successfully.");
});

export { submitResult, approveResult, rejectResult, getStudentResults, getAllResults, submitResultsFromOCR, generateAnnualResultsForClassroom, uploadVoiceNote, deleteVoiceNote, parseOcrText };