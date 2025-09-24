import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import StudentExam from "../models/StudentExam.js";
import Question from "../models/Question.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Result from "../models/Result.js";
import Classroom from "../models/Classroom.js";
import Subject from "../models/Subject.js";
import AppError from "../utils/AppError.js";
import ExamInvigilator from "../models/ExamInvigilator.js";
import { roles } from "../config/roles.js";
import User from "../models/userModel.js";
import { updateOrCreateResult, bulkUpdateOrCreateResults } from "../services/resultService.js";
import { cacheStudentResults, getCachedStudentResults, invalidateStudentResultCache } from "../config/cache.js";
import { autoMarkSubmission } from "../services/examMarkerService.js";
import { getIO } from "../config/socket.js";
import { AuthorizationError, NotFoundError, ConflictError } from "../utils/AppError.js";


/**
 * @desc    Create a new exam
 * @route   POST /api/exams
 * @access  Protected (Teachers, Admins)
 */
export const createExam = asyncHandler(async (req, res, next) => {
    const { classroom, title, session, term, subject, durationInMinutes, maxPauses } = req.body;

    // The user's school is automatically assigned from their profile
    const school = req.user.school;
    if (!school) {
        return next(new AppError("You are not associated with a school. Cannot create an exam.", 403));
    }

    // Validate classroom belongs to user's school
    const cls = await Classroom.findById(classroom);
    if (!cls) {
        return next(new AppError("Classroom not found", 404));
    }
    if (String(cls.school) !== String(school)) {
        return next(new AppError("Classroom does not belong to your school", 403));
    }

    // Validate subject belongs to user's school
    const subj = await Subject.findById(subject);
    if (!subj) {
        return next(new AppError("Subject not found", 404));
    }
    if (String(subj.school) !== String(school)) {
        return next(new AppError("Subject does not belong to your school", 403));
    }

    const exam = await Exam.create({
        school,
        classroom,
        title,
        subject,
        session,
        term,
        durationInMinutes,
        maxPauses,
        createdBy: req.user._id,
    });

    res.status(201).json({
        message: "Exam created successfully.",
        data: exam,
    });
});

/**
 * @desc    Add a question to an existing exam
 * @route   POST /api/exams/:examId/questions
 * @access  Protected (Teachers, Admins)
 */
export const addQuestionToExam = asyncHandler(async (req, res, next) => {
    const { exam } = req; // The exam document is attached by the checkExamAccess middleware
    const { questionText, questionType, marks, options, correctOptionIndex, keywords } = req.body;

    const session = await mongoose.startSession();
    let usedTransaction = false;
    try {
        // Attempt to start a transaction; note startTransaction itself doesn't talk to server
        session.startTransaction();
        usedTransaction = true;
    } catch (_) {
        usedTransaction = false;
    }

    try {
        const questionData = {
            exam: exam._id,
            questionText,
            questionType,
            marks,
            options: questionType === "objective" ? options : undefined,
            correctOptionIndex: questionType === "objective" ? correctOptionIndex : undefined,
            keywords: questionType === "theory" ? keywords : undefined,
        };

        if (usedTransaction) {
            try {
                const [newQuestion] = await Question.create([questionData], { session });
                await Exam.findByIdAndUpdate(exam._id, { $inc: { totalMarks: marks } }, { new: true, session });
                await session.commitTransaction();

                return res.status(201).json({
                    message: "Question added successfully and exam total marks updated.",
                    data: newQuestion,
                });
            } catch (err) {
                // If transactions unsupported, fallback without session
                if (err?.code === 20 || err?.codeName === 'IllegalOperation') {
                    try { await session.abortTransaction(); } catch (_) { /* ignore */ }
                    const created = await Question.create(questionData);
                    await Exam.findByIdAndUpdate(exam._id, { $inc: { totalMarks: marks } }, { new: true });
                    return res.status(201).json({
                        message: "Question added successfully and exam total marks updated.",
                        data: created,
                    });
                }
                throw err;
            }
        } else {
            // Fallback path without transactions (test env with standalone Mongo)
            const created = await Question.create(questionData);
            await Exam.findByIdAndUpdate(exam._id, { $inc: { totalMarks: marks } }, { new: true });
            return res.status(201).json({
                message: "Question added successfully and exam total marks updated.",
                data: created,
            });
        }
    } catch (error) {
        try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        // Log the detailed error for debugging purposes (skip noise for transaction unsupported)
        if (!(error?.code === 20 || error?.codeName === 'IllegalOperation')) {
            console.error("ADD_QUESTION_ERROR:", error);
        }

        // Provide a more specific error message if it's a validation error from Mongoose
        if (error.name === 'ValidationError') {
            return next(new AppError(`A database validation error occurred: ${error.message}`, 400));
        }
        return next(new AppError("Failed to add question due to a server error. The operation was rolled back.", 500));
    } finally {
        try { session.endSession(); } catch (_) { /* ignore */ }
    }
});

/**
 * @desc    Student requests to start an exam, creating a submission record and returning questions.
 * @route   POST /api/exams/:examId/start
 * @access  Protected (Students)
 */
export const startExam = asyncHandler(async (req, res, next) => {
    const { examId } = req.params;
    const studentId = req.user.studentProfile; // student's profile ID is attached to the user object

    if (!studentId) {
        return next(new AppError("You are not registered as a student.", 403));
    }

    const exam = await Exam.findById(examId).select("-createdBy");
    if (!exam) {
        return next(new AppError("Exam not found.", 404));
    }

    const student = await Student.findById(studentId);
    if (student.classroom.toString() !== exam.classroom.toString()) {
        return next(new AppError("You are not enrolled in the classroom for this exam.", 403));
    }

    // Check if a submission already exists
    let submission = await StudentExam.findOne({ exam: examId, student: studentId });

    if (submission) {
        if (["submitted", "marked"].includes(submission.status)) {
            return next(new AppError("You have already submitted this exam.", 400));
        }
        // If 'in-progress' or 'paused', they are resuming, so we return the existing data.
        // If it's 'ready', they are re-fetching before starting the timer.
    } else {
        // Create a new submission with a 'ready' status. Timer is NOT started yet.
        submission = await StudentExam.create({
            exam: examId,
            student: studentId,
            session: exam.session, // Add required fields
            term: exam.term,       // Add required fields
            status: "ready", // New status
        });
    }


    await submission.populate('exam');


    // Fetch questions for the exam, but exclude sensitive fields like correct answers and keywords
    const questions = await Question.find({ exam: examId }).select("-correctOptionIndex -keywords");

    res.status(200).json({
        message: "Exam data retrieved. Ready to begin.",
        submission,
        questions,
    });
});

/**
 * @desc    Student confirms they have loaded the exam and begins the timer.
 * @route   POST /api/exams/submissions/:submissionId/begin
 * @access  Protected (Students)
 */
export const beginExam = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const studentId = req.user.studentProfile;

    const submission = await StudentExam.findOne({ _id: submissionId, student: studentId }).populate('exam');

    if (!submission) {
        return next(new AppError("Submission not found or you are not the owner.", 404));
    }

    // This action can only be performed once, when the exam is 'ready'.
    if (submission.status !== 'ready') {
        return next(new AppError(`Cannot begin an exam that is already ${submission.status}.`, 400));
    }

    const exam = submission.exam;
    const startTime = exam.durationInMinutes ? new Date() : undefined;
    const endTime = startTime ? new Date(startTime.getTime() + exam.durationInMinutes * 60 * 1000) : undefined;

    submission.status = "in-progress";
    submission.startTime = startTime;
    submission.endTime = endTime;

    await submission.save();

    res.status(200).json({
        message: "Exam timer started.",
        submission,
    });
});

/**
 * @desc    Student pauses their exam.
 * @route   POST /api/exams/submissions/:submissionId/pause.
 * @access  Protected (Teachers, Admins)
 */
export const pauseExam = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const submission = await StudentExam.findById(submissionId).populate('exam');

    if (!submission) {
        return next(new AppError("Submission not found.", 404));
    }

    // Authorization check: User must be from the same school, unless they are a Global Super Admin.

    if (
        req.user.role !== roles.GLOBAL_SUPER_ADMIN &&
        req.user.school.toString() !== submission.exam.school.toString()
    ) {
        return next(new AppError("Forbidden: You do not have permission for this exam.", 403));
    }

    if (submission.status !== "in-progress") {
        return next(new AppError(`Cannot pause an exam that is already ${submission.status}.`, 400));
    }
    if (!submission.endTime) {
        return next(new AppError("This exam is not timed and cannot be paused.", 400));
    }

    const remainingTime = submission.endTime.getTime() - Date.now();

    submission.status = "paused";
    submission.timeRemainingOnPause = remainingTime > 0 ? remainingTime : 0;
    // Note: We do not increment pauseCount as this is an administrative action.
    await submission.save();

    // Notify via Socket.IO if available
    const roomName = `exam-${submission.exam._id}`;
    try {
        const io = typeof getIO === 'function' ? getIO() : undefined;
        if (io && typeof io.to === 'function') {
            // Notify teacher dashboard of the status change
            io.to(roomName).emit("studentProgressUpdate", {
                type: "pause",
                payload: {
                    submissionId: submission._id,
                    status: "paused",
                    pauseCount: submission.pauseCount,
                }
            });
            // Notify the specific student that they have been paused
            io.to(roomName).emit("examPausedByAdmin", {
                studentId: submission.student.toString(),
            });
        }
    } catch (_) { /* ignore socket errors in tests */ }


    res.status(200).json({
        message: "Exam paused successfully.",
        data: submission,
    });
});

/**
 * @desc    Student resumes their exam.
 * @route   POST /api/exams/submissions/:submissionId/resume
 * @access  Protected (Students)
 */
export const resumeExam = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const studentId = req.user.studentProfile;

    const submission = await StudentExam.findOne({
        _id: submissionId,
        student: studentId,
    });

    if (!submission) {
        return next(new AppError("Submission not found or you are not the owner.", 404));
    }
    if (submission.status !== "paused") {
        return next(new AppError("This exam is not currently paused.", 400));
    }

    // Calculate the new end time based on when the exam is resumed
    submission.endTime = new Date(Date.now() + submission.timeRemainingOnPause);
    submission.status = "in-progress";
    submission.timeRemainingOnPause = undefined; // Clear the field
    await submission.save();

    res.status(200).json({
        message: "Exam resumed successfully.",
        data: submission,
    });
});

/**
 * @desc    Student submits or updates an answer for a question.
 * @route   PATCH /api/exams/submissions/:submissionId/answer
 * @access  Protected (Students)
 */
export const submitAnswer = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const { questionId, answerText, selectedOptionIndex } = req.body;
    const studentId = req.user.studentProfile;

    if (!questionId || (answerText === undefined && selectedOptionIndex === undefined)) {
        return next(new AppError("Question ID and an answer (text or index) are required.", 400));
    }

    const submission = await StudentExam.findById(submissionId);

    if (!submission) {
        return next(new AppError("Exam submission not found.", 404));
    }
    if (submission.student.toString() !== studentId.toString()) {
        return next(new AppError("Forbidden: You do not own this submission.", 403));
    }
    if (submission.status !== "in-progress") {
        return next(new AppError("Cannot submit answers to a finalized exam.", 400));
    }

    // Atomically upsert the answer in the `answers` array
    const answerExists = submission.answers.some(ans => ans.question.toString() === questionId);

    if (answerExists) {
        // If answer exists, update it
        await StudentExam.updateOne(
            { _id: submissionId, "answers.question": questionId },
            { $set: { "answers.$.answerText": answerText, "answers.$.selectedOptionIndex": selectedOptionIndex } }
        );
        res.status(200).json({ message: "Answer updated successfully." });
    } else {
        // If answer does not exist, push a new one
        await StudentExam.updateOne(
            { _id: submissionId },
            { $push: { answers: { question: questionId, answerText, selectedOptionIndex } } }
        );
        res.status(200).json({ message: "Answer saved successfully." });
    }
});

/**
 * @desc    Student finalizes and submits their exam.
 * @route   POST /api/exams/submissions/:submissionId/finalize
 * @access  Protected (Students)
 */
export const finalizeSubmission = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const studentId = req.user.studentProfile;

    const submissionToCheck = await StudentExam.findById(submissionId).populate('exam');
    if (!submissionToCheck) {
        return next(new AppError("Submission not found.", 404));
    }

    // Check if the exam is timed and if the submission is late
    if (submissionToCheck.endTime) {
        const gracePeriodMs = 30 * 1000; // 30 seconds grace period for network latency
        if (new Date() > new Date(submissionToCheck.endTime.getTime() + gracePeriodMs)) {
            // The frontend should have auto-submitted. If this is called way later, it's a problem.
            // We will still finalize it but could add a flag in a real scenario.
            console.log(`Late submission for ${submissionId} by student ${studentId}.`);
        }
    }

    const submission = await StudentExam.findOneAndUpdate(
        { _id: submissionId, student: studentId, status: "in-progress" },
        { $set: { status: "submitted" } },
        { new: true }
    );

    if (!submission) {
        return next(new AppError("Submission not found, is already finalized, or you are not the owner.", 404));
    }

    res.status(200).json({
        message: "Exam submitted successfully. Your results will be available after marking.",
        submission,
    });
});



/**
 * @desc    Triggers the smart marking process for a student's exam submission.
 * @route   POST /api/exams/submissions/:submissionId/mark
 * @access  Protected (Teachers, Admins)
 */
export const markStudentExam = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const submission = await StudentExam.findById(submissionId);

    if (!submission) {
        return next(new AppError("Exam submission not found.", 404));
    }
    if (submission.status === "marked") {
        return next(new AppError("This exam has already been marked.", 400));
    }
    if (submission.status !== "submitted") {
        return next(new AppError("Exam must be submitted before it can be marked.", 400));
    }

    const markedSubmission = await autoMarkSubmission(submissionId);

    res.status(200).json({
        message: "Exam marked successfully using the smart-marking engine.",
        data: markedSubmission,
    });
});

/**
 * @desc    Teacher manually overrides the score for a single answer.
 * @route   PATCH /api/exams/submissions/:submissionId/answers/:answerId/override
 * @access  Protected (Teachers, Admins)
 */
export const overrideAnswerScore = asyncHandler(async (req, res, next) => {
    const { submissionId, answerId } = req.params;
    const { newScore, reason } = req.body;

    if (typeof newScore !== 'number') {
        return next(new AppError("A valid 'newScore' (number) is required.", 400));
    }

    const submission = await StudentExam.findById(submissionId).populate('answers.question');
    if (!submission) {
        return next(new AppError("Submission not found.", 404));
    }

    if (submission.status !== 'marked') {
        return next(new AppError("Scores can only be overridden after the exam has been auto-marked.", 400));
    }

    const answer = submission.answers.id(answerId);
    if (!answer) {
        return next(new AppError("Answer not found within this submission.", 404));
    }

    const question = answer.question;
    if (newScore < 0 || newScore > question.marks) {
        return next(new AppError(`Score must be between 0 and the question's max marks (${question.marks}).`, 400));
    }

    // Apply the override
    answer.awardedMarks = newScore;
    answer.isOverridden = true;
    answer.overriddenBy = req.user._id;
    answer.overrideReason = reason;

    // Recalculate the total score for the entire submission
    submission.totalScore = submission.answers.reduce((sum, ans) => sum + ans.awardedMarks, 0);
    await submission.save();

    res.status(200).json({ message: "Score overridden successfully.", data: submission });
});
/**
 * @desc    Posts a marked exam score to the student's main report card (Result).
 * @route   POST /api/exams/submissions/:submissionId/post-to-report-card
 * @access  Protected (Teachers, Admins)
 */
export const postExamScoreToResult = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const transaction = await mongoose.startSession();
    let usedTransaction = false;
    try {
        transaction.startTransaction();
        usedTransaction = true;
    } catch (_) {
        usedTransaction = false;
    }

    try {
        const baseQuery = StudentExam.findById(submissionId).populate([{ path: "exam" }, { path: "student", select: "school" }]);
        const submission = usedTransaction ? await baseQuery.session(transaction) : await baseQuery;

        if (!submission) throw new AppError("Exam submission not found.", 404);
        if (submission.status !== "marked") throw new AppError("Exam must be marked before posting to report card.", 400);
        if (submission.isPublished) throw new AppError("This exam score has already been published to the report card.", 400);
        if (!submission.exam.subject) throw new AppError("The source exam is not linked to a subject. Cannot post score.", 400);
        if (req.user.school.toString() !== submission.student.school.toString()) throw new AppError("Forbidden: You do not have permission for this student's school.", 403);

        const { student, exam, totalScore } = submission;
        const { session: academicSession, term, subject, classroom, totalMarks } = exam;

        const { resultDoc, wasNew } = await updateOrCreateResult({
            studentId: student._id,
            schoolId: student.school,
            classroomId: classroom,
            academicSession,
            term,
            subjectId: subject,
            score: totalScore,
            maxScore: totalMarks,
            userId: req.user._id,
            transactionSession: usedTransaction ? transaction : undefined,
        });
        submission.isPublished = true;
        usedTransaction ? await submission.save({ session: transaction }) : await submission.save();

        if (usedTransaction) await transaction.commitTransaction();

        res.status(wasNew ? 201 : 200).json({
            message: wasNew ? "New report card created with exam score." : "Score updated in student's report card.",
            data: resultDoc,
        });
    } catch (error) {
        try { await transaction.abortTransaction(); } catch (_) { /* ignore */ }
        // Fallback for environments that do not support transactions
        if (error?.code === 20 || error?.codeName === 'IllegalOperation') {
            const submission = await StudentExam.findById(submissionId).populate([{ path: "exam" }, { path: "student", select: "school" }]);
            if (!submission) return next(new AppError("Exam submission not found.", 404));
            if (submission.status !== "marked") return next(new AppError("Exam must be marked before posting to report card.", 400));
            if (submission.isPublished) return next(new AppError("This exam score has already been published to the report card.", 400));
            if (!submission.exam.subject) return next(new AppError("The source exam is not linked to a subject. Cannot post score.", 400));
            if (req.user.school.toString() !== submission.student.school.toString()) return next(new AppError("Forbidden: You do not have permission for this student's school.", 403));

            const { student, exam, totalScore } = submission;
            const { session: academicSession, term, subject, classroom, totalMarks } = exam;

            const { resultDoc, wasNew } = await updateOrCreateResult({
                studentId: student._id,
                schoolId: student.school,
                classroomId: classroom,
                academicSession,
                term,
                subjectId: subject,
                score: totalScore,
                maxScore: totalMarks,
                userId: req.user._id,
            });

            submission.isPublished = true;
            await submission.save();

            return res.status(wasNew ? 201 : 200).json({
                message: wasNew ? "New report card created with exam score." : "Score updated in student's report card.",
                data: resultDoc,
            });
        }
        next(error);
    } finally {
        try { transaction.endSession(); } catch (_) { /* ignore */ }
    }
});

/**
 * @desc    Bulk publishes all marked, unpublished scores for an entire exam.
 * @route   POST /api/exams/:examId/bulk-publish
 * @access  Protected (Teachers, Admins)
 */
export const bulkPublishExamScores = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess middleware

    const submissionsToPublish = await StudentExam.find({
        exam: exam._id,
        status: "marked",
        isPublished: false,
    }).populate([{ path: "student", select: "school fullName" }, { path: "exam" }]);

    if (submissionsToPublish.length === 0) {
        return res.status(200).json({ message: "No marked, unpublished scores found for this exam." });
    }

    const { session: academicSession, term } = exam;
    const BATCH_SIZE = parseInt(process.env.BULK_PUBLISH_BATCH_SIZE) || 100; // Configurable batch size
    const results = [];
    const successfulSubmissionIds = [];
    const startTime = Date.now();

    console.log(`🚀 Starting bulk publish for ${submissionsToPublish.length} submissions (batch size: ${BATCH_SIZE})`);

    // --- Performance Optimization: Pre-load and cache existing results ---
    const studentIds = submissionsToPublish.map(s => s.student._id);
    console.log(`📊 Pre-loading results for ${studentIds.length} students...`);

    // Try to get cached results first
    const cachedResultsMap = await getCachedStudentResults(studentIds, academicSession, term);
    const uncachedStudentIds = studentIds.filter(id => !cachedResultsMap.has(id.toString()));

    // Fetch uncached results from database
    let dbResults = [];
    if (uncachedStudentIds.length > 0) {
        dbResults = await Result.find({
            student: { $in: uncachedStudentIds },
            session: academicSession,
            term
        });

        // Cache the newly fetched results
        if (dbResults.length > 0) {
            await cacheStudentResults(dbResults, academicSession, term);
        }
    }

    // Combine cached and DB results
    const allResultsMap = new Map(cachedResultsMap);
    dbResults.forEach(result => {
        allResultsMap.set(result.student.toString(), result);
    });

    console.log(`✅ Results loaded: ${cachedResultsMap.size} from cache, ${dbResults.length} from DB`);

    // Process submissions in batches for optimal performance
    const totalBatches = Math.ceil(submissionsToPublish.length / BATCH_SIZE);
    let processedCount = 0;

    for (let i = 0; i < submissionsToPublish.length; i += BATCH_SIZE) {
        const batch = submissionsToPublish.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const batchStartTime = Date.now();

        console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} submissions, ${processedCount}/${submissionsToPublish.length} total)`);

        // Prepare bulk result updates for this batch
        const resultUpdates = [];
        const batchResults = [];

        for (const submission of batch) {
            const { student, exam: subExam, totalScore } = submission;
            const { subject, classroom, totalMarks } = subExam;

            if (!subExam.subject) {
                batchResults.push({
                    studentName: student.fullName,
                    status: "failed",
                    reason: "The source exam is not linked to a subject."
                });
                continue;
            }

            // Prepare result update for bulk operation
            resultUpdates.push({
                studentId: student._id,
                schoolId: student.school,
                classroomId: classroom,
                academicSession,
                term,
                subjectId: subject,
                score: totalScore,
                maxScore: totalMarks,
                userId: req.user._id,
            });

            batchResults.push({
                submissionId: submission._id,
                studentName: student.fullName,
                status: "pending"
            });
        }

        // Execute bulk result update for this batch
        if (resultUpdates.length > 0) {
            try {
                const bulkResult = await bulkUpdateOrCreateResults(resultUpdates);

                // Update batch results based on bulk operation outcome
                let successCount = 0;
                for (let j = 0; j < batchResults.length; j++) {
                    const resultItem = batchResults[j];
                    if (resultItem.status === "pending") {
                        // Check if this update was successful
                        const hasErrors = bulkResult.errors.some(err =>
                            err.studentId === resultUpdates[j]?.studentId
                        );

                        if (hasErrors) {
                            resultItem.status = "failed";
                            resultItem.reason = "Bulk update failed";
                        } else {
                            resultItem.status = "success";
                            successfulSubmissionIds.push(resultItem.submissionId);
                            successCount++;
                            delete resultItem.submissionId; // Remove from response
                        }
                    }
                }

                const batchTime = Date.now() - batchStartTime;
                console.log(`✅ Batch ${batchNumber} completed: ${successCount}/${batch.length} successful (${batchTime}ms, ${Math.round(batch.length / (batchTime / 1000))} ops/sec)`);

            } catch (error) {
                console.error(`❌ Batch ${batchNumber} failed:`, error.message);
                // Mark all pending items in this batch as failed
                batchResults.forEach(resultItem => {
                    if (resultItem.status === "pending") {
                        resultItem.status = "failed";
                        resultItem.reason = `Batch processing error: ${error.message}`;
                        delete resultItem.submissionId;
                    }
                });
            }
        }

        results.push(...batchResults);
        processedCount += batch.length;

        // Add small delay between batches to prevent overwhelming the database
        if (i + BATCH_SIZE < submissionsToPublish.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    // --- Perform a single bulk update for all successful submissions ---
    if (successfulSubmissionIds.length > 0) {
        await StudentExam.updateMany(
            { _id: { $in: successfulSubmissionIds } },
            { $set: { isPublished: true, publishedAt: new Date() } }
        );

        // Invalidate cache for updated students to ensure fresh data
        const updatedStudentIds = [...new Set(submissionsToPublish
            .filter(s => successfulSubmissionIds.includes(s._id.toString()))
            .map(s => s.student._id.toString())
        )];
        await invalidateStudentResultCache(updatedStudentIds, academicSession, term);
    }

    const successfulCount = results.filter(r => r.status === "success").length;
    const failedCount = results.filter(r => r.status === "failed").length;

    // Log performance metrics
    const totalTime = Date.now() - req.startTime;
    console.log(`Bulk publish completed: ${successfulCount} successful, ${failedCount} failed, ${submissionsToPublish.length} total, ${totalTime}ms`);

    res.status(207).json({
        message: `Bulk publish complete. ${successfulCount} successful, ${failedCount} failed.`,
        summary: {
            successful: successfulCount,
            failed: failedCount,
            total: submissionsToPublish.length,
            processingTimeMs: totalTime
        },
        details: results,
    });
});

/**
* @desc    Adjusts the duration of an exam, affecting all current and future takers.
* @route   PATCH /api/exams/:examId/adjust-time
* @access  Protected (Teachers, Admins)
*/
export const adjustExamTime = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess middleware
    const { additionalMinutes } = req.body;

    if (typeof additionalMinutes !== 'number' || additionalMinutes <= 0) {
        return next(new AppError("Please provide a positive number for additionalMinutes.", 400));
    }

    if (!exam.durationInMinutes) {
        return next(new AppError("This exam is not timed and its duration cannot be adjusted.", 400));
    }
    // If the user is a teacher, they must be an assigned invigilator for this exam.
    if (req.user.role === roles.TEACHER) {
        const isInvigilator = await ExamInvigilator.findOne({ exam: exam._id, teacher: req.user._id });
        if (!isInvigilator) {
            return next(new AppError("Forbidden: You are not an assigned invigilator for this exam.", 403));
        }
    }

    // Atomically increment the duration
    const updatedExam = await Exam.findByIdAndUpdate(
        exam._id,
        { $inc: { durationInMinutes: additionalMinutes } },
        { new: true }
    );

    // Broadcast the time adjustment to all students in the specific exam room
    const roomName = `exam-${exam._id}`;
    try {
        const io = typeof getIO === 'function' ? getIO() : undefined;
        if (io && typeof io.to === 'function') {
            io.to(roomName).emit("timeAdjusted", { newDurationInMinutes: updatedExam.durationInMinutes });
        }
    } catch (_) { /* ignore socket errors in tests */ }

    res.status(200).json({
        message: `Exam time extended by ${additionalMinutes} minutes. New duration is ${updatedExam.durationInMinutes} minutes.`,
        data: updatedExam,
    });
});
/**
 * @desc    Sends a real-time announcement to all students taking an exam.
 * @route   POST /api/exams/:examId/announce
 * @access  Protected (Teachers, Admins)
 */
export const sendExamAnnouncement = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess middleware
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === "") {
        return next(new AppError("Announcement message cannot be empty.", 400));
    }

    const roomName = `exam-${exam._id}`;
    try {
        const io = typeof getIO === 'function' ? getIO() : undefined;
        if (io && typeof io.to === 'function') {
            // Broadcast the announcement to all sockets in the exam room
            io.to(roomName).emit("examAnnouncement", {
                message: message.trim(),
                from: req.user.name || "Invigilator", // Use user's name if available
            });
        }
    } catch (_) { /* ignore socket errors in tests */ }

    res.status(200).json({
        message: "Announcement sent successfully.",
    });
});

/**
 * @desc    Get a list of exams with filtering
 * @route   GET /api/exams
 * @access  Protected (Teachers, Admins)
 */
export const getExams = asyncHandler(async (req, res, next) => {
    const { classroom, session, term } = req.query;
    const query = { school: req.user.school }; // Automatically scoped to the logged-in user's school

    if (classroom) query.classroom = classroom;
    if (session) query.session = session;
    if (term) query.term = term;

    const exams = await Exam.find(query)
        .populate("subject", "name")
        .populate("classroom", "label")
        .sort({ createdAt: -1 });

    res.status(200).json({
        message: "Exams retrieved successfully.",
        data: exams,
    });
});

/**
 * @desc    Get all student submissions for a specific exam
 * @route   GET /api/exams/:examId/submissions
 * @access  Protected (Teachers, Admins)
 */
export const getExamSubmissions = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess middleware

    const submissions = await StudentExam.find({ exam: exam._id })
        .populate("student", "firstName lastName admissionNumber")
        .sort({ "student.lastName": 1 });

    res.status(200).json({
        message: `Found ${submissions.length} submissions for this exam.`,
        data: submissions,
    });
});

/**
 * @desc    Assign a teacher as an invigilator for an exam.
 * @route   POST /api/exams/:examId/invigilators
 * @access  Protected (Principals, Admins)
 */
export const assignInvigilator = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess
    const { teacherId } = req.body;

    if (!teacherId) {
        return next(new AppError("A teacherId is required in the body.", 400));
    }

    const teacher = await User.findOne({ _id: teacherId, school: exam.school, role: roles.TEACHER });
    if (!teacher) {
        return next(new AppError("Teacher not found in this school or is not a teacher.", 404));
    }

    const existingAssignment = await ExamInvigilator.findOne({ exam: exam._id, teacher: teacherId });
    if (existingAssignment) {
        return res.status(409).json({ message: "This teacher is already assigned to this exam." });
    }

    // Note: We allow class/subject teachers to invigilate if assigned by Principal/Main Admin.

    const assignment = await ExamInvigilator.create({
        exam: exam._id,
        teacher: teacherId,
        school: exam.school,
        assignedBy: req.user._id,
    });

    res.status(201).json({ message: "Invigilator assigned successfully.", data: assignment });
});

/**
 * @desc    Remove an invigilator from an exam.
 * @route   DELETE /api/exams/:examId/invigilators/:teacherId
 * @access  Protected (Principals, Admins)
 */
export const removeInvigilator = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess
    const { teacherId } = req.params;

    const result = await ExamInvigilator.deleteOne({ exam: exam._id, teacher: teacherId });

    if (result.deletedCount === 0) {
        return next(new AppError("Assignment not found. This teacher may not be an invigilator for this exam.", 404));
    }

    res.status(200).json({ message: "Invigilator removed successfully." });
});

/**
 * @desc    Get all invigilators for an exam.
 * @route   GET /api/exams/:examId/invigilators
 * @access  Protected (Teachers, Principals, Admins)
 */
export const getInvigilators = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess
    const assignments = await ExamInvigilator.find({ exam: exam._id }).populate("teacher", "name email");
    res.status(200).json({ data: assignments });
});

/**
 * @desc    End an exam for all students immediately.
 * @route   POST /api/exams/:examId/end
 * @access  Protected (Teachers, Admins)
 */
export const endExam = asyncHandler(async (req, res, next) => {
    const { exam } = req; // from checkExamAccess middleware
    // Teachers can only end an exam if they were explicitly assigned as invigilators by
    // a Principal or Main Super Admin. Other roles (Principal/Admins) are allowed by route guards.
    if (req.user.role === roles.TEACHER) {
        // If scheduling is enforced, teachers (even invigilators) cannot end before scheduledEndAt
        if (exam.scheduledEndAt && new Date() < new Date(exam.scheduledEndAt)) {
            return next(new AuthorizationError("Teachers cannot end this exam before the scheduled end time."));
        }
        const assignment = await ExamInvigilator.findOne({ exam: exam._id, teacher: req.user._id }).populate('assignedBy', 'role');
        if (!assignment) {
            return next(new AuthorizationError("You are not an assigned invigilator for this exam."));
        }
        const assignerRole = assignment.assignedBy?.role;
        const allowedAssignerRoles = [roles.PRINCIPAL, roles.MAIN_SUPER_ADMIN];
        if (!allowedAssignerRoles.includes(assignerRole)) {
            return next(new AuthorizationError("You were not assigned by a Principal or Main Super Admin."));
        }
    }

    // Find all in-progress submissions for this exam
    const inProgressSubmissions = await StudentExam.find({
        exam: exam._id,
        status: "in-progress"
    });

    // Force-submit all in-progress submissions
    if (inProgressSubmissions.length > 0) {
        const submissionIds = inProgressSubmissions.map(sub => sub._id);
        await StudentExam.updateMany(
            { _id: { $in: submissionIds } },
            {
                $set: {
                    status: "submitted",
                    endTime: new Date() // Set end time to now
                }
            }
        );
        console.log(`Force-submitted ${inProgressSubmissions.length} in-progress submissions for exam ${exam._id}`);
    }

    // Broadcast exam end to all students in the exam room
    const roomName = `exam-${exam._id}`;
    try {
        const io = typeof getIO === 'function' ? getIO() : undefined;
        if (io && typeof io.to === 'function') {
            io.to(roomName).emit("examEnded", {
                message: "The exam has been ended by the invigilator. Your submission has been finalized.",
                endedAt: new Date(),
                forceSubmitted: inProgressSubmissions.length
            });
        }
    } catch (_) { /* ignore socket errors in tests */ }

    res.status(200).json({
        message: `Exam ended successfully. ${inProgressSubmissions.length} in-progress submissions were force-submitted.`,
        data: {
            examId: exam._id,
            forceSubmittedCount: inProgressSubmissions.length,
            endedAt: new Date()
        }
    });
});
