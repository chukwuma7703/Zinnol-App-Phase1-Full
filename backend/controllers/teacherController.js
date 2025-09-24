// Minimal teacher controller to support route tests
export const createTeacher = async (req, res) => {
    return res.status(201).json({ ok: true, op: 'create', body: req.body });
};

export const getTeachers = async (_req, res) => {
    return res.status(200).json({ ok: true, op: 'list' });
};

export const getTeacherById = async (req, res) => {
    return res.status(200).json({ ok: true, id: req.params.id });
};

export const updateTeacher = async (req, res) => {
    return res.status(200).json({ ok: true, id: req.params.id, body: req.body });
};

export const deleteTeacher = async (req, res) => {
    return res.status(204).end();
};

export default {
    createTeacher,
    getTeachers,
    getTeacherById,
    updateTeacher,
    deleteTeacher,
};
