import asyncHandler from "express-async-handler";
import School from "../models/School.js";
import User from "../models/userModel.js";
import { roles } from "../config/roles.js";

// Helper to get online/offline users (stub: replace with real logic if available)
async function getOnlineOfflineCounts(userIds) {
    // If you track online status, replace this with your logic
    // For now, return all as offline
    return { online: 0, offline: userIds.length };
}

export const getMainSuperAdminOverview = asyncHandler(async (req, res) => {
    const mainSuperAdminId = req.user._id;

    // Find all schools where this user is a mainSuperAdmin
    const schools = await School.find({ mainSuperAdmins: mainSuperAdminId }).select('_id');
    const schoolIds = schools.map(s => s._id);

    // Find all users in these schools
    const users = await User.find({ school: { $in: schoolIds } });

    // Count by role
    const totalSuperAdmins = users.filter(u => u.role === roles.SUPER_ADMIN).length;
    const totalPrincipals = users.filter(u => u.role === roles.PRINCIPAL).length;
    const totalTeachers = users.filter(u => u.role === roles.TEACHER).length;
    const totalParents = users.filter(u => u.role === roles.PARENT).length;
    const totalStudents = users.filter(u => u.role === roles.STUDENT).length;
    const totalUsers = users.length;

    // Online/offline (stub)
    const { online, offline } = await getOnlineOfflineCounts(users.map(u => u._id));

    res.json({
        totalSchools: schoolIds.length,
        totalSuperAdmins,
        totalPrincipals,
        totalTeachers,
        totalParents,
        totalStudents,
        onlineUsers: online,
        offlineUsers: offline,
        totalUsers,
    });
});
