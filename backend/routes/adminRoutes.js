// Example in a route file like /routes/admin.js

import express from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { roles } from '../config/roles.js';

const router = express.Router(); // eslint-disable-line new-cap


router.get(
  '/admin-data',
  protect, // First, ensure the user is authenticated
  authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN]), // Then, check their role
  (req, res) => {
    // This route will only be accessible to super-admins
    res.status(200).json({ message: 'Welcome, admin!', user: req.user });
  }
);

export default router;