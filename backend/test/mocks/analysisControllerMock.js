const ok = (res, body = { ok: true }) => res.status(200).json(body);

export const getGlobalOverviewAnalytics = (_req, res) => ok(res, { ok: true });
export const getSystemWideAnalytics = (_req, res) => ok(res, { ok: true });
export const getStudentAnalytics = (_req, res) => ok(res, { data: {} });
export const getTeacherAnalytics = (_req, res) => ok(res, { data: {} });
export const getSchoolDashboardAnalytics = (_req, res) => ok(res, { data: {} });
export const queryStudents = (_req, res) => ok(res, { data: [] });
export const createShareableLink = (_req, res) => ok(res, { link: 'link' });
export const getTeacherActivityAnalytics = (_req, res) => ok(res, { data: {} });
export const getTimetableCompliance = (_req, res) => ok(res, { data: {} });
export const getSchoolAcademicTerms = (_req, res) => ok(res, { data: {} });
export const getAllAcademicSessions = (_req, res) => ok(res, { data: [] });
export const getClassroomLeaderboard = (_req, res) => ok(res, { data: [] });
export const getDecliningStudents = (_req, res) => ok(res, { data: [] });
export const getStudentExamHistory = (_req, res) => ok(res, { data: [] });

export default {
    getGlobalOverviewAnalytics,
    getSystemWideAnalytics,
    getStudentAnalytics,
    getTeacherAnalytics,
    getSchoolDashboardAnalytics,
    queryStudents,
    createShareableLink,
    getTeacherActivityAnalytics,
    getTimetableCompliance,
    getSchoolAcademicTerms,
    getAllAcademicSessions,
    getClassroomLeaderboard,
    getDecliningStudents,
    getStudentExamHistory,
};
