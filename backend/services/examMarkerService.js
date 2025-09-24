import StudentExam from "../models/StudentExam.js";
import AppError from "../utils/AppError.js";
import { getIO } from "../config/socket.js";

/**
 * =============================================================================
 * MARKING STRATEGIES
 * Each function handles the logic for a specific question type.
 * This pattern makes it easy to add new question types without modifying the main service.
 * =============================================================================
 */

const markObjective = (question, answer) => {
  return answer.selectedOptionIndex === question.correctOptionIndex ? question.marks : 0;
};

const markTheory = (question, answer) => {
  const studentAnswerText = (answer.answerText || "").toLowerCase();
  let awardedMarks = 0;

  if (studentAnswerText && (question.keywords || []).length > 0) {
    awardedMarks = question.keywords.reduce((score, keyword) => {
      // Use a regex with word boundaries (\b) to match whole words only.
      // This prevents "art" from matching "start".
      const keywordRegex = new RegExp(`\\b${keyword.text.toLowerCase()}\\b`, 'i');
      if (keywordRegex.test(studentAnswerText)) {
        return score + keyword.marks;
      }
      return score;
    }, 0);
  }
  // Cap the awarded marks at the question's total possible marks.
  return Math.min(awardedMarks, question.marks);
};

const markFillInTheBlank = (question, answer) => {
  const studentAnswer = (answer.answerText || "").trim().toLowerCase();
  const correctAnswers = (question.correctAnswers || []).map(a => a.toLowerCase());
  return correctAnswers.includes(studentAnswer) ? question.marks : 0;
};


// A map of question types to their corresponding marking functions.
const markingStrategies = {
  "objective": markObjective,
  "theory": markTheory,
  "fill-in-the-blank": markFillInTheBlank,
  // To add a new question type, just add its function here!
};

/**
 * A reusable service function to perform smart-marking on a submission.
 * This can be called automatically on finalization or manually by a teacher.
 * @param {string} submissionId - The ID of the StudentExam submission to mark.
 * @returns {Promise<object>} The updated and marked submission document.
 * @throws {AppError} If the submission cannot be found.
 */
export async function autoMarkSubmission(submissionId) {
  console.log(`[Auto-Marking] Starting process for submission: ${submissionId}`);
  try {
    // Find the submission and populate the associated questions
    const submission = await StudentExam.findById(submissionId).populate({
      path: "answers.question",
      model: "Question",
    });

    // If the submission doesn't exist, throw an error
    if (!submission) {
      console.error(`[Auto-Marking] FAILED: Submission with ID ${submissionId} not found.`);
      throw new AppError(`Submission with ID ${submissionId} not found.`, 404);
    }

    // Skip the marking process if the submission has already been marked or is in another status
    if (submission.status !== 'submitted') {
      console.log(`[Auto-Marking] SKIPPED: Submission ${submissionId} has status '${submission.status}', not 'submitted'.`);
      return submission;
    }

    let totalScore = 0;
    // Iterate through each answer in the submission
    for (const answer of submission.answers) {
      const question = answer.question;

      // If a question is missing, log a warning and skip the answer
      if (!question) {
        console.warn(`[Auto-Marking] WARN: Question for an answer in submission ${submissionId} is missing. Skipping answer.`);
        answer.awardedMarks = 0;
        continue;
      }

      // If a teacher has manually overridden the score, use that value
      if (answer.isOverridden) {
        totalScore += answer.awardedMarks;
        console.log(`[Auto-Marking] - Question ${question._id}: Score overridden by teacher. Awarded ${answer.awardedMarks} marks.`);
        continue;
      }

      let awardedMarks = 0;

      // --- Use the Strategy Pattern ---
      const markingFunction = markingStrategies[question.questionType];

      if (markingFunction) {
        awardedMarks = markingFunction(question, answer);
        console.log(`[Auto-Marking] - Question ${question._id} (${question.questionType}): Awarded ${awardedMarks}/${question.marks} marks.`);
      } else {
        console.warn(`[Auto-Marking] WARN: No marking strategy found for question type '${question.questionType}'. Awarding 0 marks.`);
        awardedMarks = 0;
      }
      answer.awardedMarks = awardedMarks;
      totalScore += awardedMarks;
    }

    // Update the submission's total score and status
    submission.totalScore = totalScore;
    submission.status = "marked";
    submission.markedAt = new Date();

    await submission.save();

    console.log(`[Auto-Marking] SUCCESS: Submission ${submissionId} marked. Final Score: ${totalScore}`);
    // Emit socket event if Socket.IO is initialized (noop in tests without socket)
    try {
      const io = typeof getIO === 'function' ? getIO() : undefined;
      if (io && typeof io.to === 'function') {
        io.to(`exam-${submission.exam}`).emit("submissionAutoMarked", { submissionId: submission._id, totalScore: submission.totalScore, status: 'marked' });
      }
    } catch (_) { /* ignore socket errors in tests */ }

    return submission;
  } catch (error) {
    console.error(`[Auto-Marking] FAILED to process or save submission ${submissionId}. Error: ${error.message}`, error);
    // Re-throw the error to be caught by the calling function
    throw error;
  }
}