// Centralized validation & normalization helpers for analytics layer
import mongoose from 'mongoose';
import { ValidationError } from './AppError.js';
import logger from './logger.js';

const SESSION_REGEX_SLASH = /^\d{4}\/\d{4}$/; // 2024/2025
const SESSION_REGEX_DASH = /^\d{4}-\d{4}$/;   // 2024-2025 (legacy)

export function normalizeSession(raw) {
    if (!raw) return raw;
    if (SESSION_REGEX_SLASH.test(raw)) return raw;
    if (SESSION_REGEX_DASH.test(raw)) return raw.replace('-', '/');
    return raw; // return as-is; separate validation reports error
}

export function isValidSessionFormat(value) {
    return SESSION_REGEX_SLASH.test(value) || SESSION_REGEX_DASH.test(value);
}

export function validateObjectId(value, field, errors) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        errors.push({ field, message: `Invalid ${field} format` });
        return false;
    }
    return true;
}

export function validateRequired(value, field, errors, message) {
    if (value === undefined || value === null || value === '') {
        errors.push({ field, message: message || `${field} is required` });
        return false;
    }
    return true;
}

export function validateEnum(value, field, allowed, errors) {
    if (value != null && !allowed.includes(value)) {
        errors.push({ field, message: `Invalid ${field}. Allowed: ${allowed.join(', ')}` });
        return false;
    }
    return true;
}

export function throwIfErrors(errors, summary = 'Validation failed') {
    if (errors.length) {
        logger.debug('Validation errors', { errors });
        throw new ValidationError(summary, errors);
    }
}

export function validateTermNumeric(term, field, errors) {
    if (term != null && !/^\d+$/.test(term)) {
        errors.push({ field, message: `Invalid ${field} format. Expected a number.` });
        return false;
    }
    return true;
}

export function buildValidationContext(req) {
    return {
        ip: req.ip,
        url: req.originalUrl,
        userId: req.user?._id,
        method: req.method
    };
}

// Validate an ISO date (YYYY-MM-DD) string
export function validateISODate(value, field, errors) {
    if (value == null) return true; // allow optional; required handled separately
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push({ field, message: `Invalid ${field} format. Expected YYYY-MM-DD.` });
        return false;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
        errors.push({ field, message: `Invalid ${field} date value.` });
        return false;
    }
    return true;
}

// Validate positive number (integer) in string or number form
export function validatePositiveNumber(value, field, errors) {
    if (value == null) return true;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        errors.push({ field, message: `${field} must be a positive number` });
        return false;
    }
    return true;
}
