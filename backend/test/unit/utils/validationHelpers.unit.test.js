import { validateObjectId, throwIfErrors } from '../../../utils/validationHelpers.js';

describe('validationHelpers', () => {
    test('validateObjectId pushes error for invalid id', () => {
        const errors = [];
        validateObjectId('not-an-id', 'fieldX', errors);
        expect(errors.length).toBe(1);
        expect(errors[0].field).toBe('fieldX');
    });

    test('validateObjectId accepts valid hex24', () => {
        const errors = [];
        validateObjectId('507f1f77bcf86cd799439011', 'fieldX', errors);
        expect(errors.length).toBe(0);
    });

    test('throwIfErrors throws with formatted message', () => {
        expect(() => throwIfErrors([{ field: 'a', message: 'Bad' }], 'Prefix')).toThrow(/Prefix/);
    });

    test('throwIfErrors does nothing when empty', () => {
        expect(() => throwIfErrors([], 'Ignore')).not.toThrow();
    });
});
