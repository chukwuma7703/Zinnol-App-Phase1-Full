import { calculatePosition, calculateGrade, setGradeScale, getGradeScale } from '../../../services/resultService.js';

describe('resultService.calc helpers', () => {
    test('calculatePosition default param (no args) returns []', () => {
        expect(calculatePosition()).toEqual([]);
    });
    test('calculatePosition handles ties correctly (competition ranking)', () => {
        const positions = calculatePosition([85, 90, 85, 90, 75]);
        // scores: [90,90,85,85,75] -> positions [1,1,3,3,5] wrt sorted; mapped back to original indices
        expect(positions).toEqual([3, 1, 3, 1, 5]);
    });

    test('calculateGrade clamps input to [0,100] and handles NaN', () => {
        expect(calculateGrade(1000).code).toBeDefined();
        expect(calculateGrade(-50).code).toBeDefined();
        expect(calculateGrade(NaN)).toEqual({ code: 'F9', label: 'Fail' });
    });

    test('calculateGrade falls back to last band when no range matches', () => {
        const prev = getGradeScale();
        try {
            // Define a scale with a gap (50-89 missing). Score 70 should fall back to last band (F).
            setGradeScale([
                { min: 90, max: 100, code: 'A', label: 'Excellent' },
                { min: 0, max: 49, code: 'F', label: 'Fail' }
            ]);
            const g = calculateGrade(70);
            expect(g.code).toBe('F');
        } finally {
            // Restore previous scale to avoid side effects on other tests
            setGradeScale(prev);
        }
    });

    test('calculateGrade returns F9 for non-number inputs', () => {
        expect(calculateGrade('75')).toEqual({ code: 'F9', label: 'Fail' });
        expect(calculateGrade(undefined)).toEqual({ code: 'F9', label: 'Fail' });
        expect(calculateGrade(null)).toEqual({ code: 'F9', label: 'Fail' });
    });
});
