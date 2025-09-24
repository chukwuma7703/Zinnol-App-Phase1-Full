import googleDriveService from '../services/googleDriveService.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ok, created, error as errorResp } from '../utils/ApiResponse.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/AppError.js';
import mongoose from 'mongoose';
import { roles } from '../config/roles.js';

/**
 * Google Drive Controller
 * Handles Google Drive integration for data backup and organization
 */

/**
 * Get Google Drive authentication URL for Super Admin
 * GET /api/drive/auth/url
 */
export const getAuthUrl = asyncHandler(async (req, res) => {
    // Check if user is Super Admin
    const superAdminRoles = new Set([
        roles.GLOBAL_SUPER_ADMIN,
        roles.MAIN_SUPER_ADMIN,
        roles.SUPER_ADMIN,
    ]);
    if (!req.user?.role || !superAdminRoles.has(req.user.role)) {
        throw new ForbiddenError('Only Super Admin can configure Google Drive');
    }

    const authUrl = googleDriveService.generateAuthUrl();

    ok(res, { authUrl }, 'Google Drive authentication URL generated');
});

/**
 * Handle Google Drive OAuth callback
 * GET /api/drive/auth/callback
 */
export const handleAuthCallback = asyncHandler(async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return ok(res, null, `Authentication failed: ${error}`, undefined, 400);
    }

    if (!code) {
        return ok(res, null, 'Authorization code is required', undefined, 400);
    }

    try {
        const result = await googleDriveService.handleAuthCallback(code);

        // Redirect to frontend with success message
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/google-drive?success=true`);
    } catch (error) {
        console.error('Google Drive auth callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/google-drive?error=auth_failed`);
    }
});

/**
 * Disconnect Google Drive
 * DELETE /api/drive/auth/disconnect
 */
export const disconnectDrive = asyncHandler(async (req, res) => {
    // Check if user is Super Admin
    const superAdminRoles = new Set([
        roles.GLOBAL_SUPER_ADMIN,
        roles.MAIN_SUPER_ADMIN,
        roles.SUPER_ADMIN,
    ]);
    if (!req.user?.role || !superAdminRoles.has(req.user.role)) {
        throw new ForbiddenError('Only Super Admin can disconnect Google Drive');
    }

    // Clear tokens
    process.env.GOOGLE_DRIVE_TOKENS = '';
    googleDriveService.isAuthenticated = false;
    googleDriveService.drive = null;
    googleDriveService.tokens = null;
    googleDriveService.rootFolderId = null;

    ok(res, null, 'Google Drive disconnected successfully');
});

/**
 * Upload term data to Google Drive
 * POST /api/drive/upload-term-data
 */
export const uploadTermData = asyncHandler(async (req, res) => {
    const { schoolName, academicYear, term, data } = req.body;

    // Validate required fields
    if (!schoolName || !academicYear || !term) {
        throw new ValidationError('Missing required fields: schoolName, academicYear, term');
    }

    if (!data || typeof data !== 'object') {
        throw new ValidationError('Data must be provided as an object');
    }

    // Upload data to Google Drive
    const uploadResult = await googleDriveService.uploadTermData(schoolName, academicYear, term, data);

    ok(res, uploadResult, 'Term data uploaded to Google Drive successfully');
});

/**
 * Create school folder structure
 * POST /api/drive/create-school-structure
 */
export const createSchoolStructure = asyncHandler(async (req, res) => {
    const { schoolName, academicYear, term } = req.body;

    if (!schoolName || !academicYear || !term) {
        throw new ValidationError('Missing required fields: schoolName, academicYear, term');
    }

    const folders = await googleDriveService.createSchoolFolderStructure(schoolName, academicYear, term);

    created(res, folders, 'School folder structure created successfully');
});

/**
 * List files in a school folder
 * GET /api/drive/list-files/:schoolName/:academicYear/:term/:folderType
 */
export const listFiles = asyncHandler(async (req, res) => {
    const { schoolName, academicYear, term, folderType } = req.params;

    if (!schoolName || !academicYear || !term || !folderType) {
        throw new ValidationError('Missing required parameters: schoolName, academicYear, term, folderType');
    }

    // Create folder structure to get folder IDs
    const folders = await googleDriveService.createSchoolFolderStructure(schoolName, academicYear, term);

    const folderId = folders[folderType];
    if (!folderId) {
        throw new NotFoundError(`Folder type '${folderType}' not found`);
    }

    const files = await googleDriveService.listFiles(folderId);

    ok(res, files, 'Files retrieved successfully');
});

/**
 * Get Google Drive service status
 * GET /api/drive/status
 */
export const getDriveStatus = asyncHandler(async (req, res) => {
    const status = {
        isAuthenticated: googleDriveService.isAuthenticated,
        rootFolderId: googleDriveService.rootFolderId,
        serviceAvailable: googleDriveService.drive !== null,
        tokensValid: googleDriveService.isTokenValid(),
        authUrl: googleDriveService.isAuthenticated ? null : googleDriveService.generateAuthUrl()
    };

    ok(res, status, 'Google Drive service status retrieved');
});

/**
 * Backup school data
 * POST /api/drive/backup-school-data
 */
export const backupSchoolData = asyncHandler(async (req, res) => {
    const { schoolId, includeStudents = true, includeResults = true, includeReports = true } = req.body;

    if (!schoolId) {
        throw new ValidationError('School ID is required');
    }

    // Import models dynamically to avoid circular dependencies
    const { default: School } = await import('../models/School.js');
    const { default: Student } = await import('../models/Student.js');
    const { default: Result } = await import('../models/Result.js');

    // Get school information
    const school = await School.findById(schoolId);
    if (!school) {
        throw new NotFoundError('School not found');
    }

    // Authorization check: Super Admin can only backup schools where they are mainSuperAdmin, school admins only their school
    const superAdminRoles = new Set([
        roles.GLOBAL_SUPER_ADMIN,
        roles.MAIN_SUPER_ADMIN,
        roles.SUPER_ADMIN,
    ]);
    const isSuperAdmin = !!req.user?.role && superAdminRoles.has(req.user.role);
    const isSchoolAdmin = req.user?.role === roles.SCHOOL_ADMIN && req.user.school && req.user.school.toString() === schoolId;
    const isMainSuperAdminForSchool = isSuperAdmin && school.mainSuperAdmins && school.mainSuperAdmins.some(adminId => adminId.toString() === req.user._id.toString());

    if (!isMainSuperAdminForSchool && !isSchoolAdmin) {
        throw new ForbiddenError('You do not have permission to backup this school\'s data');
    }

    const backupData = {
        timestamp: new Date().toISOString(),
        school: {
            name: school.name,
            address: school.address,
            phone: school.phone,
            email: school.email
        }
    };

    // Get current academic year and term (you might want to make this configurable)
    const currentDate = new Date();
    const academicYear = `${currentDate.getFullYear()}/${currentDate.getFullYear() + 1}`;
    const term = Math.ceil((currentDate.getMonth() + 1) / 4); // Rough estimation

    // Collect student data
    if (includeStudents) {
        const students = await Student.find({ school: schoolId })
            .select('admissionNumber firstName lastName class status')
            .lean();

        backupData.students = students;
    }

    // Collect results data
    if (includeResults) {
        const results = await Result.find({ school: schoolId })
            .populate('student', 'firstName lastName admissionNumber')
            .populate('subject', 'name')
            .populate('exam', 'name term academicYear')
            .lean();

        backupData.results = results;
    }

    // Create reports data
    if (includeReports) {
        const totalStudents = await Student.countDocuments({ school: schoolId });
        const totalResults = await Result.countDocuments({ school: schoolId });

        // Calculate average scores, pass rates, etc.
        const resultsStats = await Result.aggregate([
            { $match: { school: mongoose.Types.ObjectId(schoolId) } },
            {
                $group: {
                    _id: null,
                    averageScore: { $avg: '$score' },
                    totalExams: { $sum: 1 },
                    passCount: {
                        $sum: { $cond: [{ $gte: ['$score', 50] }, 1, 0] }
                    }
                }
            }
        ]);

        const stats = resultsStats[0] || { averageScore: 0, totalExams: 0, passCount: 0 };
        const passRate = stats.totalExams > 0 ? (stats.passCount / stats.totalExams) * 100 : 0;

        backupData.report = {
            totalStudents,
            totalExams: stats.totalExams,
            averageScore: Math.round(stats.averageScore * 100) / 100,
            passRate: Math.round(passRate * 100) / 100,
            generatedAt: new Date().toISOString()
        };
    }

    // Upload backup to Google Drive
    const uploadResult = await googleDriveService.uploadTermData(
        school.name,
        academicYear,
        term.toString(),
        backupData
    );

    ok(res, { backup: backupData, upload: uploadResult }, 'School data backed up to Google Drive successfully');
});

/**
 * Get schools available for backup (Super Admin gets all schools, others get their schools)
 * GET /api/drive/available-schools
 */
export const getAvailableSchools = asyncHandler(async (req, res) => {
    const { default: School } = await import('../models/School.js');

    let schools;
    const superAdminRoles = new Set([
        roles.GLOBAL_SUPER_ADMIN,
        roles.MAIN_SUPER_ADMIN,
        roles.SUPER_ADMIN,
    ]);
    const isSuperAdmin = !!req.user?.role && superAdminRoles.has(req.user.role);

    if (isSuperAdmin) {
        // Super Admin can only see schools where they are mainSuperAdmin
        schools = await School.find({ mainSuperAdmins: req.user._id })
            .select('name address phone email createdAt')
            .sort({ name: 1 })
            .lean();
    } else if (req.user?.role === roles.SCHOOL_ADMIN && req.user.school) {
        // School admin can only see their school
        schools = await School.findById(req.user.school)
            .select('name address phone email createdAt')
            .lean();
        schools = schools ? [schools] : [];
    } else {
        schools = [];
    }

    ok(res, schools, 'Available schools retrieved successfully');
});
