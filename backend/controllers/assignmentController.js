import asyncHandler from 'express-async-handler';
import Assignment from '../models/Assignment.js';
import AssignmentSubmission from '../models/AssignmentSubmission.js';
import Classroom from '../models/Classroom.js';
import Subject from '../models/Subject.js';
import AppError from '../utils/AppError.js';
import { roles } from '../config/roles.js';
import { ok, created } from '../utils/ApiResponse.js';

/**
 * @desc    Create a new assignment
 * @route   POST /api/assignments
 * @access  Protected (Teachers)
 */
export const createAssignment = asyncHandler(async (req, res, next) => {
    const { classroom, subject, title, description, dueDate } = req.body;

    // Add input validation
    if (!classroom || !subject || !title || !description || !dueDate) {
        return next(new AppError('All fields are required.', 400));
    }

    if (new Date(dueDate) <= new Date()) {
        return next(new AppError('Due date must be in the future.', 400));
    }

    // Verify classroom and subject belong to user's school
    const [classroomDoc, subjectDoc] = await Promise.all([
        Classroom.findById(classroom),
        Subject.findById(subject)
    ]);

    if (!classroomDoc || classroomDoc.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Invalid classroom.', 400));
    }

    if (!subjectDoc || subjectDoc.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Invalid subject.', 400));
    }

    const assignment = await Assignment.create({
        school: req.user.school,
        classroom,
        subject,
        teacher: req.user._id,
        title,
        description,
        dueDate,
        status: 'published', // Or 'draft' if you want a two-step process
    });

    // TODO: Add logic to handle file uploads for assignment attachments
    // TODO: Send notifications to students in the classroom

    return created(res, assignment, 'Assignment created successfully.');
});

/**
 * @desc    Get assignments for a classroom
 * @route   GET /api/assignments/class/:classroomId
 * @access  Protected (Teachers, Students in that class)
 */
export const getAssignmentsForClass = asyncHandler(async (req, res, next) => {
    const { classroomId } = req.params;

    // Add authorization check
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
        return next(new AppError('Classroom not found.', 404));
    }

    if (classroom.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Access denied to this classroom.', 403));
    }

    const assignments = await Assignment.find({ classroom: classroomId, status: 'published' })
        .populate('teacher', 'name')
        .sort({ dueDate: -1 });

    return ok(res, assignments, 'Assignments retrieved successfully.');
});

/**
 * @desc    Get a single assignment
 * @route   GET /api/assignments/:id
 * @access  Protected (Teachers, Students in that class)
 */
export const getAssignment = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const assignment = await Assignment.findById(id)
        .populate('teacher', 'name')
        .populate('classroom', 'name level')
        .populate('subject', 'name code');

    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check if user has access to this assignment's classroom
    const classroom = await Classroom.findById(assignment.classroom);
    if (!classroom || classroom.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Access denied to this assignment.', 403));
    }

    return ok(res, assignment, 'Assignment retrieved successfully.');
});

/**
 * @desc    Update an assignment
 * @route   PATCH /api/assignments/:id
 * @access  Protected (Teachers - assignment creator only)
 */
export const updateAssignment = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { title, description, dueDate } = req.body;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Only the teacher who created the assignment can update it
    if (assignment.teacher.toString() !== req.user._id.toString()) {
        return next(new AppError('You can only update assignments you created.', 403));
    }

    // Validate due date if provided
    if (dueDate && new Date(dueDate) <= new Date()) {
        return next(new AppError('Due date must be in the future.', 400));
    }

    const updatedAssignment = await Assignment.findByIdAndUpdate(
        id,
        { title, description, dueDate },
        { new: true, runValidators: true }
    ).populate('teacher', 'name')
        .populate('classroom', 'name level')
        .populate('subject', 'name code');

    // TODO: Notify students of assignment updates

    return ok(res, updatedAssignment, 'Assignment updated successfully.');
});

/**
 * @desc    Student submits their work for an assignment
 * @route   POST /api/assignments/:id/submit
 * @access  Protected (Students)
 */
export const submitAssignment = asyncHandler(async (req, res, next) => {
    const { id: assignmentId } = req.params;
    const { textSubmission } = req.body;
    const studentId = req.user.studentProfile;

    if (!studentId) {
        return next(new AppError('You must be a student to submit an assignment.', 403));
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check for existing submission
    const submission = await AssignmentSubmission.findOne({ assignment: assignmentId, student: studentId });
    if (submission) {
        return next(new AppError('You have already submitted this assignment.', 409));
    }

    const status = new Date() > new Date(assignment.dueDate) ? 'late' : 'submitted';

    // Create new submission
    const newSubmission = await AssignmentSubmission.create({
        assignment: assignmentId,
        student: studentId,
        textSubmission,
        status,
    });

    // TODO: Handle file uploads for submission attachments

    return created(res, newSubmission, 'Assignment submitted successfully.');
});

/**
 * @desc    Teacher grades a student's submission
 * @route   PATCH /api/assignments/submissions/:submissionId/grade
 * @access  Protected (Teachers)
 */
export const gradeSubmission = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;

    const submission = await AssignmentSubmission.findByIdAndUpdate(submissionId, {
        grade,
        feedback,
        status: 'graded',
        gradedBy: req.user._id,
    }, { new: true });

    if (!submission) {
        return next(new AppError('Submission not found.', 404));
    }

    // TODO: Send notification to the student that their work has been graded.

    return ok(res, submission, 'Submission graded successfully.');
});