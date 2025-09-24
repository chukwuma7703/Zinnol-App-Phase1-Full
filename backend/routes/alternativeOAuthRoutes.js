import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { generateTokens } from '../utils/generateToken.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @route   POST /api/auth/github
 * @desc    GitHub OAuth (you can implement this while waiting for Google)
 * @access  Public
 */
router.post('/github', async (req, res) => {
  try {
    const { code } = req.body;
    
    // GitHub OAuth implementation
    // This is a placeholder - you can implement GitHub OAuth
    // while waiting for Google quota approval
    
    ApiResponse.ok(res, { message: 'GitHub OAuth coming soon' });
  } catch (error) {
    ApiResponse.error(res, 'GitHub OAuth failed', 500);
  }
});

/**
 * @route   POST /api/auth/microsoft
 * @desc    Microsoft OAuth (alternative option)
 * @access  Public
 */
router.post('/microsoft', async (req, res) => {
  try {
    const { code } = req.body;
    
    // Microsoft OAuth implementation
    // Another alternative while waiting for Google
    
    ApiResponse.ok(res, { message: 'Microsoft OAuth coming soon' });
  } catch (error) {
    ApiResponse.error(res, 'Microsoft OAuth failed', 500);
  }
});

export default router;