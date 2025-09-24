import express from 'express';
import {
    createTransaction,
    getTransactions,
    updateTransactionStatus,
    getTransactionById,
    deleteTransaction
} from '../controllers/buserTransactionController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { roles } from '../config/roles.js';

const router = express.Router();

// Create a new transaction (limited roles)
router.post('/', protect, authorizeRoles([roles.STUDENT, roles.PARENT, roles.BUSER_ADMIN, roles.MAIN_SUPER_ADMIN]), createTransaction);

// Get all transactions (Buser Admin, Global/Main Super Admin)
router.get('/', protect, authorizeRoles([roles.BUSER_ADMIN, roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), getTransactions);

// Get a single transaction
router.get('/:id', protect, authorizeRoles([roles.BUSER_ADMIN, roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.STUDENT, roles.PARENT]), getTransactionById);

// Approve/decline/mark as paid (Buser Admin only)
router.put('/:id/status', protect, authorizeRoles([roles.BUSER_ADMIN]), updateTransactionStatus);

// Delete a transaction (Buser Admin, Global/Main Super Admin)
router.delete('/:id', protect, authorizeRoles([roles.BUSER_ADMIN, roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN]), deleteTransaction);

export default router;
