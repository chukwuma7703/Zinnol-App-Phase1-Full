const ok = (res, body = { ok: true }) => res.status(200).json(body);
const created = (res, body = { ok: true }) => res.status(201).json(body);

export const createClassroom = (req, res) => created(res, { data: { _id: 'c1', ...req.body } });
export const getClassrooms = (_req, res) => ok(res, { data: [{ _id: 'c1', name: 'JSS1 A' }] });
export const updateClassroom = (_req, res) => ok(res, { data: { updated: true } });
export const deleteClassroom = (_req, res) => ok(res, { data: { deleted: true } });

export default { createClassroom, getClassrooms, updateClassroom, deleteClassroom };
