import BuserTransaction from '../models/BuserTransaction.js';
import asyncHandler from 'express-async-handler';
import { roles } from '../config/roles.js';
import AppError from '../utils/AppError.js';
import Student from '../models/Student.js';
import mongoose from 'mongoose';

// Create a new transaction (student/parent requests an item)
export const createTransaction = asyncHandler(async (req, res, next) => {
    let { item, student, parent, amount } = req.body;
    const schoolId = req.user.school;

    // Validate required fields
    if (item == null || student == null || amount == null) {
        return next(new AppError('Item, student ID, and amount are required', 400));
    }
    if (!schoolId) {
        return next(new AppError('Your user account is not associated with a school.', 403));
    }

    if (amount <= 0) {
        return next(new AppError('Amount must be greater than 0', 400));
    }

    // Security: Verify the student belongs to the user's school
    const studentDoc = await Student.findOne({ _id: student, school: schoolId });
    if (!studentDoc) {
        return next(new AppError('Student not found in your school.', 404));
    }

    // Normalize optional parent field to avoid CastError during save
    if (parent && !mongoose.Types.ObjectId.isValid(parent)) {
        parent = undefined;
    }

    const requestedBy = req.user._id;
    const transaction = await BuserTransaction.create({
        item, student, parent, amount, school: schoolId, requestedBy
    });
    res.status(201).json(transaction);
});

// Get all transactions (Buser Admin, Global/Main Super Admin)
export const getTransactions = asyncHandler(async (req, res, next) => {
    // Optionally filter by school, status, etc.
    const { status } = req.query;
    const query = {};

    // Security: Scope query by school unless the user is a Global Super Admin
    if (req.user.role === roles.GLOBAL_SUPER_ADMIN) {
        // Global admin can filter by any school if they provide the query param
        if (req.query.school) {
            query.school = req.query.school;
        }
    } else {
        // Other admins (Buser, Main Super Admin) are restricted to their own school
        if (!req.user.school) {
            return next(new AppError('Your admin account is not associated with a school.', 403));
        }
        query.school = req.user.school;
    }

    if (status) query.status = status;

    // Pagination & sorting (non-breaking: optional)
    const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const limitRaw = parseInt(req.query.limit ?? '0', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 0; // cap at 100
    const skip = limit ? (page - 1) * limit : 0;

    let q = BuserTransaction.find(query)
        .sort({ createdAt: -1 });

    if (limit) {
        q = q.skip(skip).limit(limit);
    }

    const transactions = await q.exec();

    // Optionally include pagination meta if limit is used
    if (limit) {
        const total = await BuserTransaction.countDocuments(query);
        return res.json({ data: transactions, page, limit, total });
    }

    res.json(transactions);
});

// Approve or decline a transaction (Buser Admin only)
export const updateTransactionStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['approved', 'declined', 'paid'].includes(status)) {
        return next(new AppError('Valid status (approved, declined, or paid) is required', 400));
    }

    // Security: Buser Admin is restricted to their own school
    if (!req.user.school) {
        return next(new AppError('Your admin account is not associated with a school.', 403));
    }

    const transaction = await BuserTransaction.findOne({ _id: id, school: req.user.school });
    if (!transaction) {
        return next(new AppError('Transaction not found in your school.', 404));
    }

    // Enforce simple transition rules
    const current = transaction.status;
    const allowed = {
        pending: ['approved', 'declined'],
        approved: ['paid', 'declined'],
        declined: [],
        paid: []
    };
    if (!allowed[current]?.includes(status)) {
        return next(new AppError(`Invalid status transition from ${current} to ${status}.`, 400));
    }

    transaction.status = status;
    if (status === 'approved' || status === 'declined') {
        transaction.approvedBy = req.user._id;
    }
    if (status === 'paid') {
        transaction.paidAt = new Date();
    }

    await transaction.save();
    res.json(transaction);
});

// Get a single transaction
export const getTransactionById = asyncHandler(async (req, res, next) => {
    const transaction = await BuserTransaction.findById(req.params.id);

    if (!transaction) {
        return next(new AppError('Transaction not found or you do not have permission to view it.', 404));
    }

    // Authorization: Allow access if the user is the one who requested it, a global admin, or an admin of the correct school.
    const isOwner = transaction.requestedBy?.toString() === req.user._id.toString();
    const isGlobalAdmin = req.user.role === roles.GLOBAL_SUPER_ADMIN;
    const isSchoolAdmin =
        [roles.BUSER_ADMIN, roles.MAIN_SUPER_ADMIN].includes(req.user.role) &&
        req.user.school?.toString() === transaction.school?.toString();
    const isParentOnTx = req.user.role === roles.PARENT && transaction.parent?.toString() === req.user._id.toString();

    if (isOwner || isGlobalAdmin || isSchoolAdmin || isParentOnTx) {
        res.json(transaction);
    } else {
        return next(new AppError('Transaction not found or you do not have permission to view it.', 404));
    }
});

// Delete a transaction (admin only)
export const deleteTransaction = asyncHandler(async (req, res, next) => {
    const query = { _id: req.params.id };

    // Security: Scope query by school unless the user is a Global Super Admin
    if (req.user.role !== roles.GLOBAL_SUPER_ADMIN) {
        if (!req.user.school) {
            return next(new AppError('Your admin account is not associated with a school.', 403));
        }
        query.school = req.user.school;
    }

    const transaction = await BuserTransaction.findOne(query);
    if (!transaction) {
        return next(new AppError('Transaction not found or you do not have permission to delete it.', 404));
    }

    if (transaction.status === 'paid') {
        return next(new AppError('Paid transactions cannot be deleted.', 400));
    }

    await transaction.deleteOne();
    res.json({ message: 'Transaction deleted successfully' });
});
