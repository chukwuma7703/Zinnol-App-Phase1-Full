// Test-only user controller mock to keep route tests DB/network-free
const ok = (res, data = {}) => res.status(200).json(data);
const created = (res, data = {}) => res.status(201).json(data);

export const registerUser = (req, res) => created(res, { user: { email: req.body?.email || 'test@example.com' } });
export const loginUser = (_req, res) => ok(res, { accessToken: 'access-token', refreshToken: 'refresh-token' });
export const logoutUser = (_req, res) => ok(res, { message: 'User logged out' });
export const refreshToken = (_req, res) => ok(res, { accessToken: 'new-access-token' });

export const setupMfa = (_req, res) => ok(res, { otpauth_url: 'otpauth://test' });
export const verifyMfa = (_req, res) => ok(res, { verified: true });
export const verifyLoginMfa = (_req, res) => ok(res, { mfa: 'ok' });
export const disableMfa = (_req, res) => ok(res, { disabled: true });
export const regenerateRecoveryCodes = (_req, res) => ok(res, { codes: ['A', 'B'] });

export const getUserProfile = (_req, res) => ok(res, { email: 'test@example.com' });
export const updateUserProfile = (_req, res) => ok(res, { user: { name: 'Updated' } });
export const getMe = (_req, res) => ok(res, { user: { id: 'me' } });

export const createUser = (_req, res) => created(res, { email: 'new@example.com' });
export const getUsers = (_req, res) => ok(res, { users: [] });
export const getUserById = (req, res) => ok(res, { id: req.params?.id || 'u1' });
export const updateUserRole = (_req, res) => ok(res, { updated: true });
export const updateUserStatus = (_req, res) => ok(res, { active: true });
export const deleteUser = (_req, res) => ok(res, { deleted: true });
export const getDashboardUsers = (_req, res) => ok(res, { users: [] });

export const forgotPassword = (_req, res) => ok(res, { sent: true });
export const resetPassword = (_req, res) => ok(res, { reset: true });
export const adminResetPassword = (_req, res) => ok(res, { reset: true });
export const googleLogin = (_req, res) => ok(res, { accessToken: 'access-token', user: { email: 'google@example.com' } });

export default {
    registerUser,
    loginUser,
    logoutUser,
    refreshToken,
    setupMfa,
    verifyMfa,
    disableMfa,
    regenerateRecoveryCodes,
    getUserProfile,
    updateUserProfile,
    getMe,
    createUser,
    getUsers,
    getUserById,
    updateUserRole,
    updateUserStatus,
    deleteUser,
    getDashboardUsers,
    forgotPassword,
    resetPassword,
    adminResetPassword,
    googleLogin,
};
