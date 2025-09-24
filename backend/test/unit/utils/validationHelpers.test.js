import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
    normalizeSession,
    isValidSessionFormat,
    validateObjectId,
    validateTermNumeric,
    validateISODate,
    validatePositiveNumber,
    throwIfErrors
} from '../../../utils/validationHelpers.js';
import { ValidationError } from '../../../utils/AppError.js';

describe('validationHelpers', () => {
    it('normalizeSession keeps slash and converts dash', () => {
        expect(normalizeSession('2024/2025')).toBe('2024/2025');
        expect(normalizeSession('2024-2025')).toBe('2024/2025');
    });

    it('isValidSessionFormat detects valid formats', () => {
        expect(isValidSessionFormat('2024/2025')).toBe(true);
        expect(isValidSessionFormat('2024-2025')).toBe(true);
        expect(isValidSessionFormat('2024_2025')).toBe(false);
    });

    it('validateObjectId pushes error for invalid id', () => {
        const errors = [];
        validateObjectId('not-an-id', 'schoolId', errors);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ field: 'schoolId' });
    });

    it('validateTermNumeric only accepts numeric strings', () => {
        const errors = [];
        validateTermNumeric('1', 'term', errors);
        validateTermNumeric('abc', 'term', errors); // invalid
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toMatch(/Invalid term format/);
    });

    it('validateISODate rejects bad format and bad value', () => {
        const errors = [];
        validateISODate('2025/01/01', 'startDate', errors); // bad format
        validateISODate('2025-13-01', 'startDate', errors); // invalid month
        expect(errors).toHaveLength(2);
        expect(errors[0].message).toMatch(/Invalid startDate format/);
        expect(errors[1].message).toMatch(/Invalid startDate date value/);
    });

    it('validatePositiveNumber enforces > 0', () => {
        const errors = [];
        validatePositiveNumber(0, 'limit', errors);
        validatePositiveNumber(-5, 'limit', errors);
        expect(errors).toHaveLength(2);
        expect(errors[0].message).toMatch(/must be a positive number/);
    });

    it('throwIfErrors throws ValidationError with details', () => {
        const errors = [{ field: 'x', message: 'x is bad' }];
        try {
            throwIfErrors(errors, 'Custom summary');
            throw new Error('Should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ValidationError);
            expect(e.message).toBe('Custom summary');
            expect(e.details).toEqual(errors);
        }
    });
});
