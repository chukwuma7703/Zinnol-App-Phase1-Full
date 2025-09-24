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
    const { classroom, subject, title, description, dueDate, attachments } = req.body;

    // Validate required fields
    if (!classroom || !subject || !title || !description || !dueDate) {
        return next(new AppError('All fields (classroom, subject, title, description, dueDate) are required.', 400));
    }

    // Validate due date is in the future
    if (new Date(dueDate) <= new Date()) {
        return next(new AppError('Due date must be in the future.', 400));
    }

    // Validate title and description length
    if (title.length > 200) {
        return next(new AppError('Title cannot exceed 200 characters.', 400));
    }
    if (description.length > 5000) {
        return next(new AppError('Description cannot exceed 5000 characters.', 400));
    }

    // Verify classroom and subject belong to user's school
    const [classroomDoc, subjectDoc] = await Promise.all([
        Classroom.findById(classroom),
        Subject.findById(subject)
    ]);

    if (!classroomDoc || classroomDoc.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Invalid classroom or access denied.', 400));
    }

    if (!subjectDoc || subjectDoc.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Invalid subject or access denied.', 400));
    }

    const assignment = await Assignment.create({
        school: req.user.school,
        classroom,
        subject,
        teacher: req.user._id,
        title: title.trim(),
        description: description.trim(),
        dueDate,
        attachments: attachments || [],
        status: 'published',
    });

    // Populate the created assignment for response
    await assignment.populate([
        { path: 'classroom', select: 'name' },
        { path: 'subject', select: 'name code' },
        { path: 'teacher', select: 'name email' }
    ]);

    // TODO: Send notifications to students in the classroom
    // TODO: Log assignment creation for audit trail

    return created(res, assignment, 'Assignment created successfully.');
});

/**
 * @desc    Get assignments for a classroom
 * @route   GET /api/assignments/class/:classroomId
 * @access  Protected (Teachers, Students in that class)
 */
export const getAssignmentsForClass = asyncHandler(async (req, res, next) => {
    const { classroomId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Verify classroom exists and user has access
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
        return next(new AppError('Classroom not found.', 404));
    }

    // Check school-level authorization
    if (classroom.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Access denied to this classroom.', 403));
    }

    // For students, verify they belong to this classroom
    if (req.user.role === roles.STUDENT) {
        if (!req.user.studentProfile) {
            return next(new AppError('Student profile not found.', 403));
        }
        
        // TODO: Check if student is enrolled in this classroom
        // const enrollment = await ClassroomEnrollment.findOne({ 
        //     classroom: classroomId, 
        //     student: req.user.studentProfile 
        // });
        // if (!enrollment) {
        //     return next(new AppError('You are not enrolled in this classroom.', 403));
        // }
    }

    // Build query
    const query = { classroom: classroomId };
    if (status) {
        query.status = status;
    } else {
        query.status = 'published'; // Default to published assignments
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [assignments, total] = await Promise.all([
        Assignment.find(query)
            .populate('teacher', 'name email')
            .populate('subject', 'name code')
            .sort({ dueDate: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        Assignment.countDocuments(query)
    ]);

    // For students, include submission status
    if (req.user.role === roles.STUDENT && req.user.studentProfile) {
        const assignmentIds = assignments.map(a => a._id);
        const submissions = await AssignmentSubmission.find({
            assignment: { $in: assignmentIds },
            student: req.user.studentProfile
        }).select('assignment status grade submittedAt');

        const submissionMap = submissions.reduce((acc, sub) => {
            acc[sub.assignment.toString()] = {
                status: sub.status,
                grade: sub.grade,
                submittedAt: sub.submittedAt
            };
            return acc;
        }, {});

        assignments.forEach(assignment => {
            assignment._doc.submissionStatus = submissionMap[assignment._id.toString()] || null;
        });
    }

    const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
    };

    return ok(res, { assignments, pagination }, 'Assignments retrieved successfully.');
});

/**
 * @desc    Get single assignment details
 * @route   GET /api/assignments/:id
 * @access  Protected (Teachers, Students in that class)
 */
export const getAssignment = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const assignment = await Assignment.findById(id)
        .populate('teacher', 'name email')
        .populate('subject', 'name code')
        .populate('classroom', 'name');

    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check school-level authorization
    if (assignment.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Access denied to this assignment.', 403));
    }

    // For students, include their submission if exists
    if (req.user.role === roles.STUDENT && req.user.studentProfile) {
        const submission = await AssignmentSubmission.findOne({
            assignment: id,
            student: req.user.studentProfile
        });
        assignment._doc.mySubmission = submission;
    }

    return ok(res, assignment, 'Assignment retrieved successfully.');
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

    // Validate submission content
    if (!textSubmission || textSubmission.trim().length === 0) {
        return next(new AppError('Submission content is required.', 400));
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check school authorization
    if (assignment.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Access denied to this assignment.', 403));
    }

    // Check if assignment is still accepting submissions
    if (assignment.status === 'closed') {
        return next(new AppError('This assignment is no longer accepting submissions.', 400));
    }

    // Check for existing submission
    let submission = await AssignmentSubmission.findOne({ 
        assignment: assignmentId, 
        student: studentId 
    });

    // Prevent resubmission of graded assignments
    if (submission && submission.status === 'graded') {
        return next(new AppError('Cannot resubmit a graded assignment.', 409));
    }

    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    const status = now > dueDate ? 'late' : 'submitted';

    if (submission) {
        // Update existing submission (allow resubmission before grading)
        submission = await AssignmentSubmission.findByIdAndUpdate(
            submission._id,
            { 
                textSubmission: textSubmission.trim(), 
                status, 
                submittedAt: now 
            },
            { new: true }
        );
    } else {
        // Create new submission
        submission = await AssignmentSubmission.create({
            assignment: assignmentId,
            student: studentId,
            textSubmission: textSubmission.trim(),
            status,
        });
    }

    // TODO: Handle file uploads for submission attachments
    // TODO: Send notification to teacher about new submission
    // TODO: Log submission for audit trail

    return created(res, submission, 'Assignment submitted successfully.');
});

/**
 * @desc    Teacher grades a student's submission
 * @route   PATCH /api/assignments/submissions/:submissionId/grade
 * @access  Protected (Teachers)
 */
export const gradeSubmission = asyncHandler(async (req, res, next) => {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;

    // Validate grade and feedback
    if (!grade) {
        return next(new AppError('Grade is required.', 400));
    }

    const submission = await AssignmentSubmission.findById(submissionId)
        .populate({
            path: 'assignment',
            select: 'school teacher title',
            populate: {
                path: 'teacher',
                select: 'name'
            }
        })
        .populate('student', 'name email');

    if (!submission) {
        return next(new AppError('Submission not found.', 404));
    }

    // Check authorization - only the assignment teacher or school admin can grade
    const canGrade = submission.assignment.teacher._id.toString() === req.user._id.toString() ||
                    req.user.role === roles.SCHOOL_ADMIN ||
                    req.user.role === roles.PRINCIPAL;

    if (!canGrade) {
        return next(new AppError('You are not authorized to grade this submission.', 403));
    }

    // Check school authorization
    if (submission.assignment.school.toString() !== req.user.school.toString()) {
        return next(new AppError('Access denied to this submission.', 403));
    }

    const updatedSubmission = await AssignmentSubmission.findByIdAndUpdate(
        submissionId,
        {
            grade: grade.toString().trim(),
            feedback: feedback ? feedback.trim() : '',
            status: 'graded',
            gradedBy: req.user._id,
            gradedAt: new Date()
        },
        { new: true }
    ).populate('student', 'name email');

    // TODO: Send notification to the student that their work has been graded
    // TODO: Log grading action for audit trail

    return ok(res, updatedSubmission, 'Submission graded successfully.');
});

/**
 * @desc    Get submissions for an assignment (Teacher view)
 * @route   GET /api/assignments/:id/submissions
 * @access  Protected (Teachers)
 */
export const getAssignmentSubmissions = asyncHandler(async (req, res, next) => {
    const { id: assignmentId } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check authorization
    const canView = assignment.teacher.toString() === req.user._id.toString() ||
                   req.user.role === roles.SCHOOL_ADMIN ||
                   req.user.role === roles.PRINCIPAL;

    if (!canView) {
        return next(new AppError('You are not authorized to view these submissions.', 403));
    }

    // Build query
    const query = { assignment: assignmentId };
    if (status) {
        query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [submissions, total] = await Promise.all([
        AssignmentSubmission.find(query)
            .populate('student', 'name email studentId')
            .populate('gradedBy', 'name')
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        AssignmentSubmission.countDocuments(query)
    ]);

    const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
    };

    return ok(res, { submissions, pagination }, 'Submissions retrieved successfully.');
});

/**
 * @desc    Update assignment
 * @route   PUT /api/assignments/:id
 * @access  Protected (Teachers - own assignments)
 */
export const updateAssignment = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { title, description, dueDate, status, attachments } = req.body;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check authorization - only assignment creator can update
    if (assignment.teacher.toString() !== req.user._id.toString()) {
        return next(new AppError('You can only update your own assignments.', 403));
    }

    // Validate due date if provided
    if (dueDate && new Date(dueDate) <= new Date()) {
        return next(new AppError('Due date must be in the future.', 400));
    }

    // Validate status transition
    if (status && !['draft', 'published', 'closed'].includes(status)) {
        return next(new AppError('Invalid status. Must be draft, published, or closed.', 400));
    }

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description) updateData.description = description.trim();
    if (dueDate) updateData.dueDate = dueDate;
    if (status) updateData.status = status;
    if (attachments) updateData.attachments = attachments;

    const updatedAssignment = await Assignment.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    ).populate([
        { path: 'classroom', select: 'name' },
        { path: 'subject', select: 'name code' },
        { path: 'teacher', select: 'name email' }
    ]);

    // TODO: Notify students of assignment updates
    // TODO: Log assignment update for audit trail

    return ok(res, updatedAssignment, 'Assignment updated successfully.');
});

/**
 * @desc    Delete assignment
 * @route   DELETE /api/assignments/:id
 * @access  Protected (Teachers - own assignments, School Admin)
 */
export const deleteAssignment = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
        return next(new AppError('Assignment not found.', 404));
    }

    // Check authorization
    const canDelete = assignment.teacher.toString() === req.user._id.toString() ||
                     req.user.role === roles.SCHOOL_ADMIN ||
                     req.user.role === roles.PRINCIPAL;

    if (!canDelete) {
        return next(new AppError('You are not authorized to delete this assignment.', 403));
    }

    // Check if there are submissions
    const submissionCount = await AssignmentSubmission.countDocuments({ assignment: id });
    if (submissionCount > 0) {
        return next(new AppError('Cannot delete assignment with existing submissions.', 400));
    }

    await Assignment.findByIdAndDelete(id);

    // TODO: Log assignment deletion for audit trail

    return ok(res, null, 'Assignment deleted successfully.');
});