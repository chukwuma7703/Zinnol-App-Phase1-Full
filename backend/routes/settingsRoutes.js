import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getOrgSettings, updateOrgSettings } from '../controllers/settingsController.js';

const router = express.Router();

router.get('/org', protect, getOrgSettings);
router.put('/org', protect, updateOrgSettings);

export default router;
