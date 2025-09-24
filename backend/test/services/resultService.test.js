/**
 * Result Service Test Suite
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  calculateGrade,
  calculatePosition,
  processResultData,
  validateResultData,
  generateResultSummary,
} from '../../services/resultService.js';
import Result from '../../models/Result.js';
import Student from '../../models/Student.js';

vi.mock('../../models/Result.js');
vi.mock('../../models/Student.js');

describe('Result Service', () => {
  describe('calculateGrade', () => {
    it('should map scores to WAEC style bands', () => {
      expect(calculateGrade(88).code).toBe('A1');
      expect(calculateGrade(72).code).toBe('B2');
      expect(calculateGrade(66).code).toBe('B3');
      expect(calculateGrade(61).code).toBe('C4');
      expect(calculateGrade(57).code).toBe('C5');
      expect(calculateGrade(52).code).toBe('C6');
      expect(calculateGrade(47).code).toBe('D7');
      expect(calculateGrade(42).code).toBe('E8');
      expect(calculateGrade(10).code).toBe('F9');
    });

    it('should clamp out of range scores', () => {
      expect(calculateGrade(101).code).toBe('A1');
      expect(calculateGrade(-5).code).toBe('F9');
    });
  });

  describe('calculatePosition', () => {
    it('should calculate positions correctly', () => {
      const scores = [95, 85, 90, 75, 80];
      const positions = calculatePosition(scores);

      expect(positions).toEqual([1, 3, 2, 5, 4]);
    });

    it('should handle tied scores', () => {
      const scores = [85, 90, 85, 90, 75];
      const positions = calculatePosition(scores);

      // Students with same score get same position
      expect(positions[0]).toBe(positions[2]); // Both 85s
      expect(positions[1]).toBe(positions[3]); // Both 90s
      expect(positions[4]).toBe(5); // 75 is last
    });

    it('should handle empty array', () => {
      expect(calculatePosition([])).toEqual([]);
    });

    it('should handle single score', () => {
      expect(calculatePosition([85])).toEqual([1]);
    });
  });

  describe('processResultData', () => {
    it('should process result data correctly', async () => {
      const resultData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
        items: [
          { subject: 'math', ca1: 15, ca2: 15, exam: 60 },
          { subject: 'english', ca1: 14, ca2: 14, exam: 58 },
        ],
      };

      const processed = await processResultData(resultData);

      expect(processed.items[0].total).toBe(90);
      expect(processed.items[0].grade).toBe('A1');
      expect(processed.items[1].total).toBe(86);
      expect(processed.items[1].grade).toBe('A1');
      expect(processed.average).toBe(88);
      expect(processed.totalScore).toBe(176);
    });

    it('should handle missing CA scores', async () => {
      const resultData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
        items: [
          { subject: 'math', exam: 70 }, // Missing CA scores
        ],
      };

      const processed = await processResultData(resultData);

      expect(processed.items[0].ca1).toBe(0);
      expect(processed.items[0].ca2).toBe(0);
      expect(processed.items[0].total).toBe(70);
    });

    it('should calculate remarks based on average', async () => {
      const excellentResult = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
        items: [{ subject: 'math', ca1: 15, ca2: 15, exam: 65 }],
      };

      const processed = await processResultData(excellentResult);
      expect(processed.remarks).toContain('Excellent');
    });
  });

  describe('validateResultData', () => {
    it('should validate correct result data', () => {
      const validData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
        items: [
          { subject: 'math', ca1: 15, ca2: 15, exam: 60 },
        ],
      };

      const errors = validateResultData(validData);
      expect(errors).toHaveLength(0);
    });

    it('should validate CA scores not exceeding 20', () => {
      const invalidData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
        items: [
          { subject: 'math', ca1: 25, ca2: 15, exam: 60 },
        ],
      };

      const errors = validateResultData(invalidData);
      expect(errors).toContain('CA1 score cannot exceed 20');
    });

    it('should validate exam score not exceeding 60', () => {
      const invalidData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
        items: [
          { subject: 'math', ca1: 15, ca2: 15, exam: 70 },
        ],
      };

      const errors = validateResultData(invalidData);
      expect(errors).toContain('Exam score cannot exceed 60');
    });

    it('should validate required fields', () => {
      const invalidData = {
        session: '2024/2025',
        items: [],
      };

      const errors = validateResultData(invalidData);
      expect(errors).toContain('Student ID is required');
      expect(errors).toContain('Term is required');
      expect(errors).toContain('At least one subject result is required');
    });

    it('should validate session format', () => {
      const invalidData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024-2025', // Wrong format
        term: 1,
        items: [{ subject: 'math', ca1: 15, ca2: 15, exam: 60 }],
      };

      const errors = validateResultData(invalidData);
      expect(errors).toContain('Invalid session format. Use YYYY/YYYY');
    });

    it('should validate term range', () => {
      const invalidData = {
        student: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 4, // Invalid term
        items: [{ subject: 'math', ca1: 15, ca2: 15, exam: 60 }],
      };

      const errors = validateResultData(invalidData);
      expect(errors).toContain('Term must be 1, 2, or 3');
    });
  });

  describe('generateResultSummary', () => {
    it('should generate comprehensive result summary', async () => {
      const mockResults = [
        {
          student: { name: 'John Doe' },
          average: 85,
          position: 2,
          items: [
            { subject: { name: 'Math' }, total: 90, grade: 'A1' },
            { subject: { name: 'English' }, total: 72, grade: 'B2' },
          ],
        },
      ];

      Result.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(mockResults),
        }),
      });

      const summary = await generateResultSummary({
        classroom: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
      });

      expect(summary).toHaveProperty('classAverage');
      expect(summary).toHaveProperty('highestScore');
      expect(summary).toHaveProperty('lowestScore');
      expect(summary).toHaveProperty('subjectPerformance');
      expect(summary).toHaveProperty('gradeDistribution');
    });

    it('should calculate grade distribution', async () => {
      const mockResults = [
        { average: 88, items: [{ grade: 'A1' }] },
        { average: 72, items: [{ grade: 'B2' }] },
        { average: 66, items: [{ grade: 'B3' }] },
        { average: 61, items: [{ grade: 'C4' }] },
        { average: 52, items: [{ grade: 'C6' }] },
      ];

      Result.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(mockResults),
        }),
      });

      const summary = await generateResultSummary({
        classroom: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
      });

      expect(summary.gradeDistribution).toHaveProperty('A1');
      expect(summary.gradeDistribution).toHaveProperty('B2');
      expect(summary.gradeDistribution).toHaveProperty('B3');
      expect(summary.gradeDistribution).toHaveProperty('C4');
      expect(summary.gradeDistribution).toHaveProperty('C6');
    });

    it('should identify top performers', async () => {
      const mockResults = [
        { student: { name: 'Top Student' }, average: 95, position: 1 },
        { student: { name: 'Second Student' }, average: 90, position: 2 },
        { student: { name: 'Third Student' }, average: 85, position: 3 },
      ];

      Result.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(mockResults),
        }),
      });

      const summary = await generateResultSummary({
        classroom: '507f1f77bcf86cd799439011',
        session: '2024/2025',
        term: 1,
      });

      expect(summary.topPerformers).toHaveLength(3);
      expect(summary.topPerformers[0].name).toBe('Top Student');
      expect(summary.topPerformers[0].average).toBe(95);
    });
  });
});