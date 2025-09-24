import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../models/School.js', () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  }
}));

vi.mock('../../../config/cache.js', () => ({
  __esModule: true,
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn()
}));

vi.mock('../../../utils/logger.js', () => ({
  __esModule: true,
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

import {
  getSchoolGradeScale,
  updateSchoolGradingSystem,
  calculateGradeForSchool,
  getAvailableGradingSystems,
  validateGradeScale,
  getSchoolGradeThresholds
} from '../../../services/gradeScaleService.js';

import School from '../../../models/School.js';
import { getCache, setCache, deleteCache } from '../../../config/cache.js';
import logger from '../../../utils/logger.js';

describe('gradeScaleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSchoolGradeScale', () => {
    it('should return WAEC default when no schoolId provided', async () => {
      const result = await getSchoolGradeScale(null);

      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'A1', label: 'Excellent' }),
        expect.objectContaining({ code: 'F9', label: 'Fail' })
      ]));
    });

    it('should return cached grade scale when available', async () => {
      const cachedScale = [{ code: 'A', label: 'Excellent', minScore: 90, maxScore: 100 }];
      getCache.mockResolvedValue(cachedScale);

      const result = await getSchoolGradeScale('school123');

      expect(getCache).toHaveBeenCalledWith('grade_scale:school123');
      expect(result).toEqual(cachedScale);
      expect(School.findById).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache when not cached', async () => {
      const schoolData = {
        gradingSystem: {
          type: 'CAMBRIDGE',
          customScale: null
        }
      };

      getCache.mockResolvedValue(null);
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(schoolData)
        })
      });

      const result = await getSchoolGradeScale('school123');

      expect(School.findById).toHaveBeenCalledWith('school123');
      expect(setCache).toHaveBeenCalledWith('grade_scale:school123', expect.any(Array), 300);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'A*', label: 'Outstanding' })
      ]));
    });

    it('should use custom scale when school has CUSTOM type', async () => {
      const customScale = [
        { code: 'A+', label: 'Perfect', minScore: 95, maxScore: 100, remarks: 'Perfect' },
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 59, remarks: 'Fail' }
      ];

      const schoolData = {
        gradingSystem: {
          type: 'CUSTOM',
          customScale
        }
      };

      getCache.mockResolvedValue(null);
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(schoolData)
        })
      });

      const result = await getSchoolGradeScale('school123');

      expect(result).toEqual([
        { code: 'A+', label: 'Perfect', minScore: 95, maxScore: 100, remarks: 'Perfect' },
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 59, remarks: 'Fail' }
      ]);
    });

    it('should handle database errors gracefully', async () => {
      getCache.mockResolvedValue(null);
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockRejectedValue(new Error('Database error'))
        })
      });

      const result = await getSchoolGradeScale('school123');

      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching grade scale for school school123:',
        expect.any(Error)
      );
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'A1' })
      ]));
    });

    it('should return WAEC default when school not found', async () => {
      getCache.mockResolvedValue(null);
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null)
        })
      });

      const result = await getSchoolGradeScale('school123');

      expect(logger.warn).toHaveBeenCalledWith(
        'School not found: school123, using WAEC default'
      );
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'A1' })
      ]));
    });

    it('should use WAEC when gradingSystem exists but has no type', async () => {
      getCache.mockResolvedValue(null);
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ gradingSystem: {} })
        })
      });

      const result = await getSchoolGradeScale('school-empty');
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'A1' }),
        expect.objectContaining({ code: 'F9' })
      ]));
    });
  });

  describe('updateSchoolGradingSystem', () => {
    it('should update school grading system successfully', async () => {
      const updatedSchool = {
        _id: 'school123',
        gradingSystem: {
          type: 'CAMBRIDGE',
          lastUpdated: new Date(),
          updatedBy: 'user123'
        }
      };

      School.findByIdAndUpdate.mockResolvedValue(updatedSchool);

      const result = await updateSchoolGradingSystem(
        'school123',
        { type: 'CAMBRIDGE' },
        'user123'
      );

      expect(School.findByIdAndUpdate).toHaveBeenCalledWith(
        'school123',
        expect.objectContaining({
          'gradingSystem.type': 'CAMBRIDGE',
          'gradingSystem.updatedBy': 'user123'
        }),
        { new: true, runValidators: true }
      );
      expect(deleteCache).toHaveBeenCalledWith('grade_scale:school123');
      expect(result).toEqual(updatedSchool);
    });

    it('should validate grading system type', async () => {
      await expect(
        updateSchoolGradingSystem('school123', { type: 'INVALID' }, 'user123')
      ).rejects.toThrow('Invalid grading system type');
    });

    it('should validate custom scale when type is CUSTOM', async () => {
      await expect(
        updateSchoolGradingSystem(
          'school123',
          { type: 'CUSTOM', customScale: null },
          'user123'
        )
      ).rejects.toThrow('Custom scale is required when type is CUSTOM');
    });

    it('should validate custom scale structure', async () => {
      const invalidScale = [
        { code: 'A', label: 'Good' } // Missing minScore and maxScore
      ];

      await expect(
        updateSchoolGradingSystem(
          'school123',
          { type: 'CUSTOM', customScale: invalidScale },
          'user123'
        )
      ).rejects.toThrow('Each grade must have code, label, minScore, and maxScore');
    });

    it('should detect overlapping ranges in custom scale', async () => {
      const overlappingScale = [
        { code: 'A', label: 'Excellent', minScore: 80, maxScore: 100, remarks: 'Excellent' },
        { code: 'B', label: 'Good', minScore: 75, maxScore: 85, remarks: 'Good' } // Overlaps with A
      ];

      await expect(
        updateSchoolGradingSystem(
          'school123',
          { type: 'CUSTOM', customScale: overlappingScale },
          'user123'
        )
      ).rejects.toThrow('Grade ranges cannot overlap');
    });

    it('should handle school not found error', async () => {
      School.findByIdAndUpdate.mockResolvedValue(null);

      await expect(
        updateSchoolGradingSystem('school123', { type: 'WAEC' }, 'user123')
      ).rejects.toThrow('School not found');
    });

    it('should set customScale and thresholds when type is CUSTOM', async () => {
      const customScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100, remarks: 'Excellent' },
        { code: 'B', label: 'Good', minScore: 80, maxScore: 89, remarks: 'Good' },
        { code: 'C', label: 'Average', minScore: 70, maxScore: 79, remarks: 'Average' },
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 69, remarks: 'Fail' }
      ];

      const updatedSchool = { _id: 'school123', gradingSystem: { type: 'CUSTOM', customScale } };
      School.findByIdAndUpdate.mockResolvedValue(updatedSchool);

      const result = await updateSchoolGradingSystem(
        'school123',
        { type: 'CUSTOM', customScale, passingGrade: 'C', honorRollGrade: 'A' },
        'user123'
      );

      expect(School.findByIdAndUpdate).toHaveBeenCalledWith(
        'school123',
        expect.objectContaining({
          'gradingSystem.type': 'CUSTOM',
          'gradingSystem.customScale': customScale,
          'gradingSystem.passingGrade': 'C',
          'gradingSystem.honorRollGrade': 'A'
        }),
        { new: true, runValidators: true }
      );
      expect(deleteCache).toHaveBeenCalledWith('grade_scale:school123');
      expect(result).toEqual(updatedSchool);
    });

    it('should reject invalid score ranges in custom scale', async () => {
      const badScale = [
        { code: 'A', label: 'Excellent', minScore: -1, maxScore: 100, remarks: 'Excellent' } // min < 0
      ];

      await expect(
        updateSchoolGradingSystem(
          'school123',
          { type: 'CUSTOM', customScale: badScale },
          'user123'
        )
      ).rejects.toThrow('Invalid score range in custom scale');
    });
  });

  describe('calculateGradeForSchool', () => {
    it('should calculate grade using school-specific scale', async () => {
      const mockScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100, remarks: 'Outstanding' },
        { code: 'B', label: 'Good', minScore: 80, maxScore: 89, remarks: 'Good' },
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 79, remarks: 'Needs Improvement' }
      ];

      // Mock getSchoolGradeScale
      getCache.mockResolvedValue(mockScale);

      const result = await calculateGradeForSchool(95, 'school123');

      expect(result).toEqual({
        code: 'A',
        label: 'Excellent',
        remarks: 'Outstanding'
      });
    });

    it('should handle invalid scores', async () => {
      const result = await calculateGradeForSchool(NaN, 'school123');

      expect(result).toEqual({
        code: 'F',
        label: 'Invalid Score'
      });
    });

    it('should clamp scores to 0-100 range', async () => {
      const mockScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100, remarks: 'Excellent' },
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 89, remarks: 'Fail' }
      ];

      getCache.mockResolvedValue(mockScale);

      // Test score above 100
      const result1 = await calculateGradeForSchool(150, 'school123');
      expect(result1.code).toBe('A');

      // Test score below 0
      const result2 = await calculateGradeForSchool(-10, 'school123');
      expect(result2.code).toBe('F');
    });

    it('should return lowest grade when no match found', async () => {
      const mockScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100, remarks: 'Excellent' }
        // No grade covers lower scores
      ];

      getCache.mockResolvedValue(mockScale);

      const result = await calculateGradeForSchool(50, 'school123');

      expect(result).toEqual({
        code: 'A',
        label: 'Excellent',
        remarks: 'Excellent'
      });
    });

    it('should fallback to F/Fail when scale is empty', async () => {
      getCache.mockResolvedValue([]);
      const result = await calculateGradeForSchool(50, 'school123');
      expect(result).toEqual({ code: 'F', label: 'Fail', remarks: 'Fail' });
    });

    it('should fallback remarks to label when remarks missing', async () => {
      const mockScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100 }, // no remarks field
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 89 }
      ];
      getCache.mockResolvedValue(mockScale);
      const res = await calculateGradeForSchool(95, 'school123');
      expect(res).toEqual({ code: 'A', label: 'Excellent', remarks: 'Excellent' });
    });
  });

  describe('getAvailableGradingSystems', () => {
    it('should return all available grading systems', () => {
      const result = getAvailableGradingSystems();

      expect(result).toHaveProperty('systems');
      expect(result).toHaveProperty('scales');
      expect(result.systems).toContain('WAEC');
      expect(result.systems).toContain('CAMBRIDGE');
      expect(result.systems).toContain('IB');
      expect(result.systems).toContain('US_GPA');
      expect(result.scales.WAEC).toBeDefined();
    });
  });

  describe('validateGradeScale', () => {
    it('should validate correct grade scale', () => {
      const validScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100, remarks: 'Excellent' },
        { code: 'B', label: 'Good', minScore: 80, maxScore: 89, remarks: 'Good' },
        { code: 'F', label: 'Fail', minScore: 0, maxScore: 79, remarks: 'Fail' }
      ];

      const result = validateGradeScale(validScale);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidScale = [
        { code: 'A', minScore: 90, maxScore: 100 } // Missing label
      ];

      const result = validateGradeScale(invalidScale);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Grade 1: label is required');
    });

    it('should detect invalid score ranges', () => {
      const invalidScale = [
        { code: 'A', label: 'Excellent', minScore: 100, maxScore: 90, remarks: 'Excellent' } // min > max
      ];

      const result = validateGradeScale(invalidScale);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Grade 1: minScore cannot be greater than maxScore');
    });

    it('should detect overlapping ranges', () => {
      const overlappingScale = [
        { code: 'A', label: 'Excellent', minScore: 80, maxScore: 100, remarks: 'Excellent' },
        { code: 'B', label: 'Good', minScore: 75, maxScore: 85, remarks: 'Good' }
      ];

      const result = validateGradeScale(overlappingScale);

      expect(result.valid).toBe(false);
      // Implementation may report overlap order as 'B and A' depending on sort; accept either
      const overlapMsg = result.errors.find(e => e.includes('Grade ranges overlap')) || '';
      expect(overlapMsg === 'Grade ranges overlap: A and B' || overlapMsg === 'Grade ranges overlap: B and A').toBe(true);
    });

    it('should detect gaps in ranges (as warnings)', () => {
      const gappedScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100, remarks: 'Excellent' },
        { code: 'B', label: 'Good', minScore: 70, maxScore: 80, remarks: 'Good' } // Gap: 81-89
      ];

      const result = validateGradeScale(gappedScale);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Gap between B and A');
    });

    it('should handle non-array input', () => {
      const result = validateGradeScale('not an array');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Grade scale must be an array');
    });

    it('should handle empty array', () => {
      const result = validateGradeScale([]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Grade scale cannot be empty');
    });

    it('should flag non-number minScore and maxScore', () => {
      const bad = [
        { code: 'A', label: 'Excellent', minScore: '90', maxScore: 100 },
        { code: 'B', label: 'Good', minScore: 80, maxScore: '89' }
      ];
      const result = validateGradeScale(bad);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        'Grade 1: minScore must be a number',
        'Grade 2: maxScore must be a number'
      ]));
    });

    it('should flag negative minScore and maxScore over 100', () => {
      const bad = [
        { code: 'X', label: 'Bad', minScore: -1, maxScore: 50 },
        { code: 'Y', label: 'TooHigh', minScore: 0, maxScore: 101 }
      ];
      const result = validateGradeScale(bad);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        'Grade 1: minScore cannot be negative',
        'Grade 2: maxScore cannot exceed 100'
      ]));
    });

    it('should require code field', () => {
      const bad = [
        { label: 'Excellent', minScore: 90, maxScore: 100 }
      ];
      const result = validateGradeScale(bad);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining(['Grade 1: code is required']));
    });
  });

  describe('getSchoolGradeThresholds', () => {
    it('should return school-specific thresholds', async () => {
      const schoolData = {
        gradingSystem: {
          passingGrade: 'C',
          honorRollGrade: 'A'
        }
      };

      const mockScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100 },
        { code: 'C', label: 'Average', minScore: 70, maxScore: 79 }
      ];

      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(schoolData)
        })
      });
      getCache.mockResolvedValue(mockScale);

      const result = await getSchoolGradeThresholds('school123');

      expect(result).toEqual({
        passing: {
          code: 'C',
          minScore: 70,
          label: 'Average'
        },
        honorRoll: {
          code: 'A',
          minScore: 90,
          label: 'Excellent'
        }
      });
    });

    it('should return defaults when school not found', async () => {
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null)
        })
      });

      const result = await getSchoolGradeThresholds('school123');

      expect(result).toEqual({
        passing: { code: 'E8', minScore: 40, label: 'Pass' },
        honorRoll: { code: 'B2', minScore: 70, label: 'Very Good' }
      });
    });

    it('should handle database errors gracefully', async () => {
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockRejectedValue(new Error('Database error'))
        })
      });

      const result = await getSchoolGradeThresholds('school123');

      expect(logger.error).toHaveBeenCalled();
      expect(result).toEqual({
        passing: { code: 'E8', minScore: 40, label: 'Pass' },
        honorRoll: { code: 'B2', minScore: 70, label: 'Very Good' }
      });
    });

    it('should fallback minScore/label when threshold codes are not in scale', async () => {
      const schoolData = {
        gradingSystem: { passingGrade: 'Z9', honorRollGrade: 'X9' }
      };
      const mockScale = [
        { code: 'A', label: 'Excellent', minScore: 90, maxScore: 100 },
        { code: 'C', label: 'Average', minScore: 70, maxScore: 79 }
      ];
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(schoolData)
        })
      });
      getCache.mockResolvedValue(mockScale);

      const result = await getSchoolGradeThresholds('school123');
      expect(result).toEqual({
        passing: { code: 'Z9', minScore: 40, label: 'Pass' },
        honorRoll: { code: 'X9', minScore: 70, label: 'Very Good' }
      });
    });
  });

  describe('getSchoolGradeScale - unknown type fallback', () => {
    it('should fallback to WAEC when gradingSystem type is unknown', async () => {
      getCache.mockResolvedValue(null);
      School.findById.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ gradingSystem: { type: 'UNKNOWN' } })
        })
      });

      const result = await getSchoolGradeScale('school-unknown');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'A1' }),
        expect.objectContaining({ code: 'F9' })
      ]));
    });
  });
});