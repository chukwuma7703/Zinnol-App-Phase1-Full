import Result from "../models/Result.js";
import AppError from "../utils/AppError.js";
// NOTE: The unit tests expect several pure helper functions (calculateGrade, calculatePosition,
// processResultData, validateResultData, generateResultSummary) that were previously missing
// from this service module. They are implemented below in a side-effect free manner so they can
// be imported directly by the Jest test suite. These helpers do not mutate database state and
// can be safely reused by controller/service layers.

/**
 * Grade boundaries:
 * 90-100: A, 80-89: B, 70-79: C, 60-69: D, 50-59: E, <50: F
 */
// Default WAEC-style grading scale (highest first). Each entry: { min, max, code, label, remark }
let activeGradeScale = [
  { min: 75, max: 100, code: 'A1', label: 'Excellent' },
  { min: 70, max: 74, code: 'B2', label: 'Very Good' },
  { min: 65, max: 69, code: 'B3', label: 'Good' },
  { min: 60, max: 64, code: 'C4', label: 'Credit' },
  { min: 55, max: 59, code: 'C5', label: 'Credit' },
  { min: 50, max: 54, code: 'C6', label: 'Credit' },
  { min: 45, max: 49, code: 'D7', label: 'Pass' },
  { min: 40, max: 44, code: 'E8', label: 'Pass' },
  { min: 0, max: 39, code: 'F9', label: 'Fail' },
];

export const setGradeScale = (scale) => {
  if (Array.isArray(scale) && scale.every(r => typeof r.min === 'number' && typeof r.max === 'number' && r.code)) {
    // Sort descending by min to ensure first match logic works
    activeGradeScale = [...scale].sort((a, b) => b.min - a.min);
  }
};

export const getGradeScale = () => activeGradeScale;

export const calculateGrade = (score, schoolId = null) => {
  if (typeof score !== 'number' || Number.isNaN(score)) return { code: 'F9', label: 'Fail' };
  const bounded = Math.min(Math.max(score, 0), 100);
  
  // If schoolId is provided, use school-specific grading (async operation)
  if (schoolId) {
    // For async school-specific grading, use calculateGradeForSchool instead
    console.warn('Use calculateGradeForSchool for school-specific grading');
  }
  
  // Fallback to default grading scale
  const band = activeGradeScale.find(r => bounded >= r.min && bounded <= r.max) || activeGradeScale[activeGradeScale.length - 1];
  return { code: band.code, label: band.label };
};

/**
 * Calculate grade using school-specific grading system
 * @param {number} score - The score to grade
 * @param {string} schoolId - School ID for grading system lookup
 * @returns {Promise<Object>} Grade object with code, label, and remarks
 */
export const calculateGradeForSchool = async (score, schoolId) => {
  if (!schoolId) {
    return calculateGrade(score);
  }

  try {
    // Import gradeScaleService to avoid circular dependency
    const { calculateGradeForSchool: calcGrade } = await import('./gradeScaleService.js');
    return await calcGrade(score, schoolId);
  } catch (error) {
    console.error('Error calculating school-specific grade:', error);
    // Fallback to default grading
    return calculateGrade(score);
  }
};

/**
 * Competition ranking: identical scores share the same position, next position is offset by count of previous scores.
 * Example: scores [95,85,90,75,80] => [1,3,2,5,4]
 * Example with ties: [85,90,85,90,75] => [3,1,3,1,5]
 */
export const calculatePosition = (scores = []) => {
  if (!Array.isArray(scores)) return [];
  // Pair scores with original index
  const indexed = scores.map((s, i) => ({ s: (typeof s === 'number' ? s : 0), i }));
  // Sort descending by score
  indexed.sort((a, b) => b.s - a.s);
  const positionsByIndex = new Array(scores.length).fill(0);
  let currentPos = 0;
  let processed = 0;
  let lastScore = null;
  for (const { s, i } of indexed) {
    processed += 1;
    if (s !== lastScore) {
      currentPos = processed; // competition ranking
      lastScore = s;
    }
    positionsByIndex[i] = currentPos;
  }
  return positionsByIndex;
};

/**
 * Process raw result data computing per-subject totals / grades and overall aggregates.
 */
export const processResultData = async (resultData) => {
  if (!resultData || !Array.isArray(resultData.items)) return { ...resultData, items: [] };
  const items = resultData.items.map(item => {
    const ca1 = item.ca1 ?? 0;
    const ca2 = item.ca2 ?? 0;
    const exam = item.exam ?? 0;
    const total = ca1 + ca2 + exam;
    const gradeObj = calculateGrade(total);
    return { ...item, ca1, ca2, exam, total, grade: gradeObj.code, gradeLabel: gradeObj.label };
  });
  const totalScore = items.reduce((sum, it) => sum + it.total, 0);
  const average = items.length ? Math.round((totalScore / items.length)) : 0;
  let remarks = '';
  // Derive remarks from grade label distribution (simple heuristic on average grade band)
  const avgGrade = calculateGrade(average);
  if (['A1', 'B2'].includes(avgGrade.code)) remarks = 'Excellent performance';
  else if (['B3', 'C4', 'C5'].includes(avgGrade.code)) remarks = 'Good performance';
  else if (['C6', 'D7', 'E8'].includes(avgGrade.code)) remarks = 'Fair performance';
  else remarks = 'Needs improvement';
  return { ...resultData, items, totalScore, average, remarks };
};

/**
 * Validate incoming result structure returning an array of error strings.
 */
export const validateResultData = (data) => {
  const errors = [];
  if (!data) return ['Data is required'];
  if (!data.student) errors.push('Student ID is required');
  if (!data.term && data.term !== 0) errors.push('Term is required');
  if (!data.items || data.items.length === 0) errors.push('At least one subject result is required');
  if (data.session && !/^\d{4}\/\d{4}$/.test(data.session)) errors.push('Invalid session format. Use YYYY/YYYY');
  if (data.term && ![1, 2, 3].includes(data.term)) errors.push('Term must be 1, 2, or 3');
  if (Array.isArray(data.items)) {
    data.items.forEach(item => {
      if (item.ca1 != null && item.ca1 > 20) errors.push('CA1 score cannot exceed 20');
      if (item.ca2 != null && item.ca2 > 20) errors.push('CA2 score cannot exceed 20');
      if (item.exam != null && item.exam > 60) errors.push('Exam score cannot exceed 60');
    });
  }
  return errors;
};

/**
 * Generate summary analytics for a classroom/session/term.
 * Relies on Result.find(...).populate(...).populate(...) mocked in tests.
 */
export const generateResultSummary = async ({ classroom, session, term }) => {
  const results = await Result.find({ classroom, session, term })
    .populate('student')
    .populate({ path: 'items.subject' });

  if (!results || results.length === 0) {
    return {
      classAverage: 0,
      highestScore: 0,
      lowestScore: 0,
      subjectPerformance: {},
      gradeDistribution: {},
      topPerformers: []
    };
  }

  // Class average based on per-result average field if present, else compute from items
  const classAverage = Math.round(results.reduce((sum, r) => sum + (r.average ?? 0), 0) / results.length);

  // Aggregate item totals for high/low score (flatten items)
  const allItemTotals = results.flatMap(r => (r.items || []).map(it => it.total ?? it.examScore ?? 0));
  const highestScore = Math.max(...allItemTotals, 0);
  const lowestScore = Math.min(...allItemTotals, 0);

  // Subject performance: average total per subject name
  const subjectTotals = {};
  const subjectCounts = {};
  for (const r of results) {
    for (const it of (r.items || [])) {
      // Prefer explicit subject name; otherwise use a meaningful toString (e.g., ObjectId), else fallback to 'Unknown'
      let subjectName = it.subject?.name;
      if (!subjectName) {
        const maybeStr = (it.subject && typeof it.subject.toString === 'function') ? it.subject.toString() : undefined;
        subjectName = (typeof maybeStr === 'string' && maybeStr !== '[object Object]' && maybeStr.trim()) ? maybeStr : 'Unknown';
      }
      const total = it.total ?? it.examScore ?? 0;
      subjectTotals[subjectName] = (subjectTotals[subjectName] || 0) + total;
      subjectCounts[subjectName] = (subjectCounts[subjectName] || 0) + 1;
    }
  }
  const subjectPerformance = Object.fromEntries(Object.entries(subjectTotals).map(([k, v]) => [k, Math.round(v / subjectCounts[k])]));

  // Grade distribution across all items
  const gradeDistribution = {};
  for (const r of results) {
    for (const it of (r.items || [])) {
      const gradeCode = it.grade || calculateGrade(it.total ?? it.examScore ?? 0).code;
      gradeDistribution[gradeCode] = (gradeDistribution[gradeCode] || 0) + 1;
    }
  }

  // Top performers (sorted by position if provided, else by average desc)
  const sorted = [...results].sort((a, b) => {
    if (a.position && b.position) return a.position - b.position;
    const aAvg = (a.average == null ? 0 : a.average);
    const bAvg = (b.average == null ? 0 : b.average);
    return bAvg - aAvg;
  });
  const topPerformers = sorted.slice(0, 3).map(r => ({ name: r.student?.name || 'Unknown', average: r.average, position: r.position }));

  return { classAverage, highestScore, lowestScore, subjectPerformance, gradeDistribution, topPerformers };
};

/**
 * Finds or creates a student's report card for a specific term and updates it with a new exam score.
 * This function is transaction-aware and includes validation and audit trails.
 *
 * @param {object} options - The options for updating the result.
 * @param {string} options.studentId - The ID of the student.
 * @param {string} options.schoolId - The ID of the school.
 * @param {string} options.classroomId - The ID of the classroom.
 * @param {string} options.academicSession - The academic session (e.g., "2023/2024").
 * @param {number} options.term - The academic term (e.g., 1, 2, 3).
 * @param {string} options.subjectId - The ID of the subject for the score.
 * @param {number} options.score - The score the student achieved in the exam.
 * @param {number} options.maxScore - The maximum possible score for the exam.
 * @param {number} [options.caScore=0] - The Continuous Assessment score.
 * @param {number} [options.maxCaScore=40] - The maximum possible CA score.
 * @param {string} options.userId - The ID of the user performing the action.
 * @param {object} [options.transactionSession] - An optional Mongoose transaction session.
 * @returns {Promise<{resultDoc: object, wasNew: boolean}>} - The updated or created result document and a flag indicating if it was new.
 */
export const updateOrCreateResult = async ({
  studentId,
  schoolId,
  classroomId,
  academicSession,
  term,
  subjectId,
  score,
  maxScore,
  caScore = 0,
  maxCaScore = 40, // Default from Result model
  userId,
  transactionSession,
}) => {
  // 1. Validation for scores
  if (score < 0 || score > maxScore) {
    throw new AppError(`Invalid exam score: ${score}. Must be between 0 and ${maxScore}.`, 400);
  }
  if (caScore < 0 || caScore > maxCaScore) {
    throw new AppError(`Invalid CA score: ${caScore}. Must be between 0 and ${maxCaScore}.`, 400);
  }

  // Note on findOneAndUpdate: While findOneAndUpdate is often more atomic, the logic here
  // requires checking for a sub-document in an array and conditionally updating or pushing.
  // The findOne() -> save() pattern is clearer, more maintainable for this case, and
  // achieves atomicity when wrapped in the provided transaction session.

  let resultDoc = await Result.findOne({ student: studentId, session: academicSession, term }).session(transactionSession);
  let wasNew = false;

  if (resultDoc) {
    // Result exists: update or add the subject item.
    const subjectItemIndex = resultDoc.items.findIndex(item => item.subject.toString() === subjectId.toString());

    if (subjectItemIndex > -1) {
      // Subject already exists, update its scores.
      resultDoc.items[subjectItemIndex].examScore = score;
      resultDoc.items[subjectItemIndex].maxExamScore = maxScore;
      resultDoc.items[subjectItemIndex].caScore = caScore;
      resultDoc.items[subjectItemIndex].maxCaScore = maxCaScore;
    } else {
      // Subject does not exist, add it to the items array.
      resultDoc.items.push({
        subject: subjectId,
        examScore: score,
        maxExamScore: maxScore,
        caScore,
        maxCaScore,
      });
    }
    resultDoc.markModified("items"); // Important for Mongoose to detect array changes
    // 2. Audit Trail
    resultDoc.lastUpdatedBy = userId;
  } else {
    // Result does not exist: create a new one.
    wasNew = true;
    resultDoc = new Result({
      student: studentId,
      school: schoolId,
      classroom: classroomId,
      session: academicSession,
      term,
      items: [{ subject: subjectId, examScore: score, maxExamScore: maxScore, caScore, maxCaScore }],
      status: "pending",
      submittedBy: userId,
      lastUpdatedBy: userId, // Set on creation as well
    });
  }

  await resultDoc.save({ session: transactionSession });
  return { resultDoc, wasNew };
};

/**
 * Bulk update or create multiple student results for better performance.
 * This function processes multiple result updates in a single database operation.
 * @param {Array} resultUpdates - Array of result update objects
 * @param {Object} [transactionSession] - Optional Mongoose transaction session
 * @returns {Promise<Object>} - Summary of bulk operation results
 */
export const bulkUpdateOrCreateResults = async (resultUpdates, transactionSession = null) => {
  if (!resultUpdates || resultUpdates.length === 0) {
    return { modifiedCount: 0, upsertedCount: 0, errors: [] };
  }

  const bulkOps = [];
  const errors = [];

  // Group updates by student for efficient processing
  const updatesByStudent = new Map();

  for (const update of resultUpdates) {
    const {
      studentId,
      schoolId,
      classroomId,
      academicSession,
      term,
      subjectId,
      score,
      maxScore,
      caScore = 0,
      maxCaScore = 40,
      userId,
    } = update;

    // Validate scores
    if (score < 0 || score > maxScore) {
      errors.push({
        studentId,
        subjectId,
        error: `Invalid exam score: ${score}. Must be between 0 and ${maxScore}.`
      });
      continue;
    }
    if (caScore < 0 || caScore > maxCaScore) {
      errors.push({
        studentId,
        subjectId,
        error: `Invalid CA score: ${caScore}. Must be between 0 and ${maxCaScore}.`
      });
      continue;
    }

    const key = `${studentId}-${academicSession}-${term}`;
    if (!updatesByStudent.has(key)) {
      updatesByStudent.set(key, {
        studentId,
        schoolId,
        classroomId,
        academicSession,
        term,
        userId,
        subjects: []
      });
    }

    updatesByStudent.get(key).subjects.push({
      subjectId,
      score,
      maxScore,
      caScore,
      maxCaScore
    });
  }

  // Create bulk operations for each student
  for (const [key, studentData] of updatesByStudent) {
    const { studentId, academicSession, term, schoolId, classroomId, userId, subjects } = studentData;

    // 1) Ensure the document exists (base upsert, init items array)
    bulkOps.push({
      updateOne: {
        filter: { student: studentId, session: academicSession, term },
        update: {
          $set: { lastUpdatedBy: userId },
          $setOnInsert: {
            student: studentId,
            school: schoolId,
            classroom: classroomId,
            session: academicSession,
            term,
            status: "pending",
            submittedBy: userId,
            createdAt: new Date(),
            items: []
          }
        },
        upsert: true
      }
    });

    // 2) Update existing items using arrayFilters (no upsert)
    const setOps = {};
    const arrayFilters = [];
    for (const subject of subjects) {
      setOps[`items.$[elem${subject.subjectId}].examScore`] = subject.score;
      setOps[`items.$[elem${subject.subjectId}].maxExamScore`] = subject.maxScore;
      setOps[`items.$[elem${subject.subjectId}].caScore`] = subject.caScore;
      setOps[`items.$[elem${subject.subjectId}].maxCaScore`] = subject.maxCaScore;
      arrayFilters.push({ [`elem${subject.subjectId}.subject`]: subject.subjectId });
    }
    /* istanbul ignore else - subjects list is never empty by construction, so setOps always has keys */
    if (Object.keys(setOps).length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { student: studentId, session: academicSession, term },
          update: { $set: { ...setOps, lastUpdatedBy: userId } },
          arrayFilters
        }
      });
    }

    // 3) Add missing items (no upsert; base doc already ensured)
    for (const subject of subjects) {
      const subjectItem = {
        subject: subject.subjectId,
        examScore: subject.score,
        maxExamScore: subject.maxScore,
        caScore: subject.caScore,
        maxCaScore: subject.maxCaScore,
      };
      bulkOps.push({
        updateOne: {
          filter: { student: studentId, session: academicSession, term, 'items.subject': { $ne: subject.subjectId } },
          update: { $set: { lastUpdatedBy: userId }, $addToSet: { items: subjectItem } }
        }
      });
    }
  }

  try {
    const result = await Result.bulkWrite(bulkOps, { session: transactionSession });
    return {
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      matchedCount: result.matchedCount,
      errors
    };
  } catch (error) {
    console.error('Bulk result update error:', error);
    return {
      modifiedCount: 0,
      upsertedCount: 0,
      matchedCount: 0,
      errors: [{ error: error.message }]
    };
  }
};
