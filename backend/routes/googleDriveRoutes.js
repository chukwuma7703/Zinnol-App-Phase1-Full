import express from 'express';
import {
    uploadTermData,
    createSchoolStructure,
    listFiles,
    getDriveStatus,
    backupSchoolData,
    getAuthUrl,
    handleAuthCallback,
    disconnectDrive,
    getAvailableSchools
} from '../controllers/googleDriveController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public OAuth callback endpoint (no auth required)
router.get('/auth/callback', handleAuthCallback);

// All other routes require authentication
router.use(protect);

// OAuth authentication endpoints
router.get('/auth/url', getAuthUrl);
router.delete('/auth/disconnect', disconnectDrive);

// School management endpoints
router.get('/available-schools', getAvailableSchools);

// Data management endpoints
router.post('/upload-term-data', uploadTermData);
router.post('/create-school-structure', createSchoolStructure);
router.get('/list-files/:schoolName/:academicYear/:term/:folderType', listFiles);
router.get('/status', getDriveStatus);
router.post('/backup-school-data', backupSchoolData);

export default router;