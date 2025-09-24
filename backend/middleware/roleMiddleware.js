// Lightweight role middleware to satisfy tests; real implementation can be expanded.
// Provides a requireRole higher-order middleware factory that checks req.user.role.
// In test environments we can stub protect to attach a user object.

export const requireRole = (allowedRoles = []) => {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role) {
            return res.status(401).json({ success: false, message: 'Unauthorized: no role' });
        }
        if (allowedRoles.length && !allowedRoles.includes(role)) {
            return res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
        }
        return next();
    };
};

export default { requireRole };
