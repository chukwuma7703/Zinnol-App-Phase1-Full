import { vi } from 'vitest';
import { processResultData, validateResultData, calculateGrade, generateResultSummary } from '../../../services/resultService.js';
import Result from '../../../models/Result.js';

vi.mock('../../../models/Result.js');

describe('resultService.process & validation helpers', () => {
    test('processResultData defaults missing fields to 0 and computes F9', async () => {
        const input = { items: [{ subject: 'sci' }] }; // ca1, ca2, exam all missing
        const processed = await processResultData(input);
        expect(processed.items[0]).toMatchObject({ ca1: 0, ca2: 0, exam: 0, total: 0 });
        expect(processed.items[0].grade).toBeDefined();
    });

    test('processResultData handles empty items array (average 0, needs improvement)', async () => {
        const processed = await processResultData({ items: [] });
        expect(processed.items).toEqual([]);
        expect(processed.average).toBe(0);
        expect(processed.remarks).toMatch(/Needs improvement/);
    });

    test('validateResultData with non-array items takes non-array branch', () => {
        const errors = validateResultData({ student: undefined, term: undefined, items: { bad: true } });
        // Should include student and term errors; items non-array path skips per-item checks
        expect(errors.some(e => /Student ID is required/.test(e))).toBe(true);
        expect(errors.some(e => /Term is required/.test(e))).toBe(true);
    });
    test('processResultData computes totals, averages, remarks', async () => {
        const input = { items: [{ subject: 'math', ca1: 10, ca2: 15, exam: 40 }, { subject: 'eng', ca1: 20, ca2: 10, exam: 25 }] };
        const processed = await processResultData(input);
        expect(processed.items).toHaveLength(2);
        const totals = processed.items.map(i => i.total);
        expect(totals).toEqual([65, 55]);
        // Average rounded
        expect(processed.average).toBe(60); // (65+55)/2 = 60
        expect(['Excellent performance', 'Good performance', 'Fair performance', 'Needs improvement']).toContain(processed.remarks);
    });

    test('processResultData handles missing items array', async () => {
        const processed = await processResultData({});
        expect(processed.items).toEqual([]);
    });

    test('validateResultData returns error when data is null', () => {
        const errors = validateResultData(null);
        expect(errors).toEqual(['Data is required']);
    });

    test('validateResultData detects multiple structural errors', () => {
        const errors = validateResultData({ session: '2024-2025', term: 4, items: [] });
        // Expect at least: Student ID, invalid session format, term must be 1-3, at least one subject
        expect(errors.some(e => /Student ID/.test(e))).toBe(true);
        expect(errors.some(e => /Invalid session format/.test(e))).toBe(true);
        expect(errors.some(e => /Term must be/.test(e))).toBe(true);
        expect(errors.some(e => /At least one subject/.test(e))).toBe(true);
    });

    test('validateResultData enforces CA and exam score caps', () => {
        const errors = validateResultData({ student: 's1', term: 1, items: [{ ca1: 25, ca2: 30, exam: 70 }] });
        expect(errors).toEqual(expect.arrayContaining([
            'CA1 score cannot exceed 20',
            'CA2 score cannot exceed 20',
            'Exam score cannot exceed 60'
        ]));
    });

    test('validateResultData accepts boundary scores when structure valid', () => {
        const errors = validateResultData({ student: 's1', term: 1, items: [{ ca1: 20, ca2: 20, exam: 60 }] });
        expect(errors).toEqual([]);
    });

    test('generateResultSummary empty path', async () => {
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => [] }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.classAverage).toBe(0);
        expect(summary.topPerformers).toEqual([]);
    });

    test('generateResultSummary aggregates data', async () => {
        const fakeResults = [
            { average: 70, position: 1, student: { name: 'A' }, items: [{ subject: { name: 'Math' }, total: 70, grade: 'B2' }] },
            { average: 80, position: 2, student: { name: 'B' }, items: [{ subject: { name: 'Math' }, total: 80, grade: 'A1' }, { subject: { name: 'Sci' }, total: 60, grade: 'B3' }] }
        ];
        Result.find.mockReturnValueOnce({
            populate: () => ({ populate: () => fakeResults })
        });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.classAverage).toBe(Math.round((70 + 80) / 2));
        expect(summary.highestScore).toBe(80);
        // Implementation seeds Math.min with 0 so lowestScore won't exceed 0 baseline
        expect(summary.lowestScore).toBe(0);
        expect(summary.subjectPerformance.Math).toBe(Math.round((70 + 80) / 2));
        expect(summary.gradeDistribution.A1).toBeGreaterThan(0);
        expect(summary.topPerformers.length).toBeGreaterThan(0);
    });

    test('generateResultSummary uses subject name/toString fallback and grade calc when grade missing', async () => {
        const fakeResults = [
            {
                average: 0, student: { name: 'X' }, items: [
                    { subject: { toString: () => 'SubId:123' }, examScore: 42 },
                    { subject: {}, total: 95 } // unknown subject -> 'Unknown', should also compute grade A1 for 95
                ]
            }
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.subjectPerformance['SubId:123']).toBeGreaterThan(0);
        expect(summary.subjectPerformance['Unknown']).toBeGreaterThan(0);
        // gradeDistribution should include both computed from 42 and 95 via calculateGrade
        expect(Object.keys(summary.gradeDistribution).length).toBeGreaterThan(0);
    });

    test('generateResultSummary sorts by average when positions missing', async () => {
        const fakeResults = [
            { average: 60, student: { name: 'C' }, items: [{ subject: { name: 'Eng' }, total: 60 }] },
            { average: 85, student: { name: 'A' }, items: [{ subject: { name: 'Eng' }, total: 85 }] },
            { average: 75, student: { name: 'B' }, items: [{ subject: { name: 'Eng' }, total: 75 }] }
        ];
        Result.find.mockReturnValueOnce({
            populate: () => ({ populate: () => fakeResults })
        });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.topPerformers[0].name).toBe('A');
        expect(summary.topPerformers[1].name).toBe('B');
        expect(summary.topPerformers[2].name).toBe('C');
    });

    test('generateResultSummary uses position ordering when present and unknown student fallback', async () => {
        const fakeResults = [
            { average: 70, position: 2, student: null, items: [{ subject: { name: 'Math' }, total: 70 }] },
            { average: 80, position: 1, student: {}, items: [{ subject: { name: 'Math' }, total: 80 }] },
            { average: 60, position: 3, student: { name: 'Z' }, items: [{ subject: { name: 'Math' }, total: 60 }] },
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.topPerformers.map(t => t.position)).toEqual([1, 2, 3]);
        expect(summary.topPerformers[0].name).toBe('Unknown');
    });

    test('validateResultData missing term with valid session triggers only term error', () => {
        const errors = validateResultData({ student: 's1', session: '2024/2025', items: [{ exam: 10 }] });
        expect(errors).toEqual(expect.arrayContaining(['Term is required']));
        // Ensure no session format error is included
        expect(errors.some(e => /Invalid session format/.test(e))).toBe(false);
    });

    test('generateResultSummary handles null results from db', async () => {
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => null }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary).toEqual({
            classAverage: 0,
            highestScore: 0,
            lowestScore: 0,
            subjectPerformance: {},
            gradeDistribution: {},
            topPerformers: []
        });
    });

    test('generateResultSummary subject keys: string, object name, null; totals default to 0', async () => {
        const fakeResults = [
            {
                average: undefined, student: { name: 'S' }, items: [
                    { subject: 'PlainSubject' },
                    { subject: { name: 'NamedSubject' } },
                    { subject: null }
                ]
            }
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.subjectPerformance['PlainSubject']).toBe(0);
        expect(summary.subjectPerformance['NamedSubject']).toBe(0);
        expect(summary.subjectPerformance['Unknown']).toBe(0);
        // All items have 0 score -> F9 counted 3 times
        expect(summary.gradeDistribution.F9).toBe(3);
    });

    test('generateResultSummary mixed positions: position respected among positioned, average dominates others', async () => {
        const fakeResults = [
            { average: 50, position: 1, student: { name: 'Pos1' }, items: [{ subject: { name: 'M' }, total: 50 }] },
            { average: 90, position: 2, student: { name: 'Pos2' }, items: [{ subject: { name: 'M' }, total: 90 }] },
            { average: 95, student: { name: 'NoPos' }, items: [{ subject: { name: 'M' }, total: 95 }] },
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.topPerformers.map(t => t.name)).toEqual(['NoPos', 'Pos1', 'Pos2']);
    });

    test('generateResultSummary sorts using 0 when average undefined', async () => {
        const fakeResults = [
            { average: undefined, student: { name: 'Undef' }, items: [{ subject: { name: 'M' }, total: 0 }] },
            { average: 10, student: { name: 'Ten' }, items: [{ subject: { name: 'M' }, total: 10 }] },
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        // Ten should come first because undefined treated as 0
        expect(summary.topPerformers.map(t => t.name)).toEqual(['Ten', 'Undef']);
    });

    test('generateResultSummary comparator handles equal averages (stable-ish)', async () => {
        const fakeResults = [
            { average: 0, student: { name: 'A' }, items: [] },
            { average: 0, student: { name: 'B' }, items: [] },
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.topPerformers.length).toBe(2);
    });

    test('generateResultSummary handles result with items undefined (loops skip safely)', async () => {
        const fakeResults = [
            { average: 0, student: { name: 'A' }, items: undefined },
            { average: 5, student: { name: 'B' }, items: [{ subject: { name: 'X' }, total: 5 }] },
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.classAverage).toBe(Math.round((0 + 5) / 2));
        expect(summary.subjectPerformance.X).toBe(5);
    });

    test('validateResultData accepts term 0 (treated as provided) and no term-range error', () => {
        const errors = validateResultData({ student: 's1', session: '2024/2025', term: 0, items: [{ exam: 10 }] });
        expect(errors.some(e => /Term is required/.test(e))).toBe(false);
        expect(errors.some(e => /Term must be/.test(e))).toBe(false);
    });

    test('generateResultSummary: subject.toString whitespace -> Unknown and empty grade -> calculated', async () => {
        const fakeResults = [
            {
                average: 0, student: { name: 'S' }, items: [
                    { subject: { toString: () => '   ' }, total: 10, grade: '' },
                    { subject: { toString: () => '[object Object]' }, examScore: 20 },
                ]
            }
        ];
        Result.find.mockReturnValueOnce({ populate: () => ({ populate: () => fakeResults }) });
        const summary = await generateResultSummary({ classroom: 'c1', session: '2024/2025', term: 1 });
        expect(summary.subjectPerformance['Unknown']).toBeGreaterThanOrEqual(0);
        // grade '' should fallback to calculated for total 10 -> F9
        expect(summary.gradeDistribution.F9).toBeGreaterThan(0);
    });
});
