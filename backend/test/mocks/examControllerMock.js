const ok = (res, body = { ok: true }) => res.status(200).json(body);
const created = (res, body = { ok: true }) => res.status(201).json(body);

export const getExams = (_req, res) => ok(res, { data: [{ title: 'Sample Exam' }] });
export const createExam = (req, res) => created(res, { data: { ...req.body, _id: 'e1' } });
export const addQuestionToExam = (_req, res) => created(res, { data: { questionText: 'Q' } });
export const getExamSubmissions = (_req, res) => ok(res, { data: [] });
export const markStudentExam = (_req, res) => ok(res);
export const submitAnswer = (_req, res) => ok(res, { message: 'Answer saved successfully.' });
export const finalizeSubmission = (_req, res) => ok(res, { message: 'Submitted.' });
export const postExamScoreToResult = (_req, res) => ok(res);
export const adjustExamTime = (_req, res) => ok(res);
export const bulkPublishExamScores = (_req, res) => ok(res);
export const pauseExam = (_req, res) => ok(res);
export const resumeExam = (_req, res) => ok(res);
export const sendExamAnnouncement = (_req, res) => ok(res);
export const assignInvigilator = (_req, res) => ok(res);
export const removeInvigilator = (_req, res) => ok(res);
export const getInvigilators = (_req, res) => ok(res, { data: [] });
export const overrideAnswerScore = (_req, res) => ok(res);
export const endExam = (_req, res) => ok(res);
export const startExam = (_req, res) => ok(res, { message: 'Exam data retrieved. Ready to begin.' });
export const beginExam = (_req, res) => ok(res, { message: 'Exam timer started.' });

export default {
    getExams,
    createExam,
    addQuestionToExam,
    getExamSubmissions,
    markStudentExam,
    submitAnswer,
    finalizeSubmission,
    postExamScoreToResult,
    adjustExamTime,
    bulkPublishExamScores,
    pauseExam,
    resumeExam,
    sendExamAnnouncement,
    assignInvigilator,
    removeInvigilator,
    getInvigilators,
    overrideAnswerScore,
    endExam,
    startExam,
    beginExam,
};
