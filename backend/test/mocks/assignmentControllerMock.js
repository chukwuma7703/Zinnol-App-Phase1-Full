// Minimal handlers for assignment routes to support smoke tests
export const createAssignment = (req, res) => {
    res.status(201).json({ message: 'Assignment created', data: { _id: 'a1', ...req.body } });
};

export const getAssignmentsForClass = (req, res) => {
    const { classroomId } = req.params;
    res.status(200).json({ message: 'Assignments retrieved successfully.', data: [{ _id: 'a1', classroom: classroomId }] });
};

export const submitAssignment = (req, res) => {
    const { id } = req.params;
    res.status(200).json({ message: 'Submission received', data: { assignment: id, status: 'submitted' } });
};

export const gradeSubmission = (req, res) => {
    const { submissionId } = req.params;
    res.status(200).json({ message: 'Submission graded', data: { _id: submissionId, grade: req.body?.grade ?? 100 } });
};

export default {
    createAssignment,
    getAssignmentsForClass,
    submitAssignment,
    gradeSubmission,
};
