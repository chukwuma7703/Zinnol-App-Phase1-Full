// Test-only mock for auth middleware to avoid real JWT/DB
export const roles = {
    STUDENT: 'STUDENT',
    TEACHER: 'TEACHER',
    PRINCIPAL: 'PRINCIPAL',
    SUPER_ADMIN: 'SUPER_ADMIN',
    MAIN_SUPER_ADMIN: 'MAIN_SUPER_ADMIN',
    GLOBAL_SUPER_ADMIN: 'GLOBAL_SUPER_ADMIN',
    PARENT: 'PARENT',
};

export const protect = (req, _res, next) => {
    const auth = req.headers?.authorization || '';
    if (!auth.startsWith('Bearer ')) {
        const err = new Error('Not authorized, no token provided.');
        err.status = 401;
        return next(err);
    }
    // Attach a permissive user by default; route tests can override headers to change roles if needed
    req.user = { _id: 'test-user', role: roles.GLOBAL_SUPER_ADMIN, school: 's1', tokenVersion: 0, isActive: true };
    next();
};

export const authorizeRoles = (_allowed = []) => (_req, _res, next) => next();

export const protectMfa = (_req, _res, next) => next();

export default { roles, protect, authorizeRoles, protectMfa };
