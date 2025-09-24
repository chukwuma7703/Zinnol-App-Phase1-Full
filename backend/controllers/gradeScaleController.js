/**
 * Grade Scale Controller - Manage per-school grading systems
 */

import asyncHandler from 'express-async-handler';
import {
  getSchoolGradeScale,
  updateSchoolGradingSystem as updateSchoolGradingSystemService,
  getAvailableGradingSystems as getAvailableGradingSystemsService,
  validateGradeScale,
  getSchoolGradeThresholds
} from '../services/gradeScaleService.js';
import { ok, created } from '../utils/ApiResponse.js';
import { AuthorizationError, ValidationError } from '../utils/AppError.js';
import { roles } from '../config/roles.js';
import { validateObjectId, throwIfErrors } from '../utils/validationHelpers.js';
import logger from '../utils/logger.js';

/**
 * @desc    Get school's current grading system
 * @route   GET /api/schools/:schoolId/grading-system
 * @access  Private (School Admin+)
 */
export const getSchoolGradingSystem = asyncHandler(async (req, res, next) => {
  const { schoolId } = req.params;
  const errors = [];

  validateObjectId(schoolId, 'schoolId', errors);
  try { throwIfErrors(errors, 'Get grading system validation failed'); } catch (e) { return next(e); }

  // Authorization: Only school members or global admins
  if (req.user.role !== roles.GLOBAL_SUPER_ADMIN && req.user.school?.toString() !== schoolId) {
    return next(new AuthorizationError('Access denied to this school\'s grading system'));
  }

  const gradeScale = await getSchoolGradeScale(schoolId);
  const thresholds = await getSchoolGradeThresholds(schoolId);

  logger.debug('Retrieved grading system', {
    schoolId,
    scaleLength: gradeScale.length,
    userId: req.user._id
  });

  return ok(res, {
    gradeScale,
    thresholds,
    schoolId
  }, 'Grading system retrieved successfully');
});

/**
 * @desc    Update school's grading system
 * @route   PUT /api/schools/:schoolId/grading-system
 * @access  Private (Principal+)
 */
export const updateSchoolGradingSystem = asyncHandler(async (req, res, next) => {
  const { schoolId } = req.params;
  const { type, customScale, passingGrade, honorRollGrade } = req.body;
  const errors = [];

  validateObjectId(schoolId, 'schoolId', errors);

  if (!type) {
    errors.push({ field: 'type', message: 'Grading system type is required' });
  }

  try { throwIfErrors(errors, 'Update grading system validation failed'); } catch (e) { return next(e); }

  // Authorization: Only principals and above for the school
  const allowedRoles = [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL];
  if (!allowedRoles.includes(req.user.role)) {
    return next(new AuthorizationError('Insufficient permissions to update grading system'));
  }

  if (req.user.role !== roles.GLOBAL_SUPER_ADMIN && req.user.school?.toString() !== schoolId) {
    return next(new AuthorizationError('Access denied to this school\'s grading system'));
  }

  // Validate custom scale if provided
  if (type === 'CUSTOM') {
    if (!customScale || !Array.isArray(customScale)) {
      return next(new ValidationError('Custom scale is required when type is CUSTOM'));
    }

    const validation = validateGradeScale(customScale);
    if (!validation.valid) {
      return next(new ValidationError(`Invalid custom scale: ${validation.errors.join(', ')}`));
    }

    if (validation.warnings.length > 0) {
      logger.warn('Grade scale validation warnings', {
        schoolId,
        warnings: validation.warnings,
        userId: req.user._id
      });
    }
  }

  try {
    const updatedSchool = await updateSchoolGradingSystemService(
      schoolId,
      { type, customScale, passingGrade, honorRollGrade },
      req.user._id
    );

    logger.info('Updated school grading system', {
      schoolId,
      type,
      userId: req.user._id,
      hasCustomScale: type === 'CUSTOM'
    });

    return ok(res, {
      gradingSystem: updatedSchool.gradingSystem,
      schoolId
    }, 'Grading system updated successfully');

  } catch (error) {
    logger.error('Failed to update grading system', {
      schoolId,
      error: error.message,
      userId: req.user._id
    });
    return next(new ValidationError(error.message));
  }
});

/**
 * @desc    Get available grading systems
 * @route   GET /api/grading-systems
 * @access  Private (Teacher+)
 */
export const getAvailableGradingSystems = asyncHandler(async (req, res) => {
  const systems = getAvailableGradingSystemsService();

  return ok(res, systems, 'Available grading systems retrieved');
});

/**
 * @desc    Validate a custom grade scale
 * @route   POST /api/grading-systems/validate
 * @access  Private (Principal+)
 */
export const validateCustomGradeScale = asyncHandler(async (req, res, next) => {
  const { gradeScale } = req.body;

  if (!gradeScale) {
    return next(new ValidationError('Grade scale is required'));
  }

  // Authorization: Only principals and above
  const allowedRoles = [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL];
  if (!allowedRoles.includes(req.user.role)) {
    return next(new AuthorizationError('Insufficient permissions to validate grade scales'));
  }

  const validation = validateGradeScale(gradeScale);

  return ok(res, validation, 'Grade scale validation completed');
});

/**
 * @desc    Preview grade calculations with a custom scale
 * @route   POST /api/grading-systems/preview
 * @access  Private (Teacher+)
 */
export const previewGradeCalculations = asyncHandler(async (req, res, next) => {
  const { gradeScale, testScores = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0] } = req.body;

  if (!gradeScale) {
    return next(new ValidationError('Grade scale is required'));
  }

  // Validate the scale first
  const validation = validateGradeScale(gradeScale);
  if (!validation.valid) {
    return next(new ValidationError(`Invalid grade scale: ${validation.errors.join(', ')}`));
  }

  // Sort scale by minScore descending for calculation
  const sortedScale = [...gradeScale].sort((a, b) => b.minScore - a.minScore);

  // Calculate grades for test scores
  const preview = testScores.map(score => {
    const clampedScore = Math.min(Math.max(score, 0), 100);
    const grade = sortedScale.find(g => clampedScore >= g.minScore && clampedScore <= g.maxScore);

    return {
      score: clampedScore,
      grade: grade ? {
        code: grade.code,
        label: grade.label,
        remarks: grade.remarks || grade.label
      } : {
        code: 'N/A',
        label: 'No Grade',
        remarks: 'Score out of range'
      }
    };
  });

  // Generate distribution summary
  const distribution = {};
  preview.forEach(p => {
    const code = p.grade.code;
    distribution[code] = (distribution[code] || 0) + 1;
  });

  return ok(res, {
    preview,
    distribution,
    validation
  }, 'Grade calculation preview generated');
});

/**
 * @desc    Get grade distribution for a school's results
 * @route   GET /api/schools/:schoolId/grade-distribution
 * @access  Private (Teacher+)
 */
export const getSchoolGradeDistribution = asyncHandler(async (req, res, next) => {
  const { schoolId } = req.params;
  const { session, term } = req.query;
  const errors = [];

  validateObjectId(schoolId, 'schoolId', errors);
  try { throwIfErrors(errors, 'Grade distribution validation failed'); } catch (e) { return next(e); }

  // Authorization: Only school members or global admins
  if (req.user.role !== roles.GLOBAL_SUPER_ADMIN && req.user.school?.toString() !== schoolId) {
    return next(new AuthorizationError('Access denied to this school\'s data'));
  }

  // Import Result model dynamically to avoid circular dependencies
  const { default: Result } = await import('../models/Result.js');

  const matchQuery = { school: schoolId, status: 'approved' };
  if (session) matchQuery.session = session;
  if (term) matchQuery.term = parseInt(term);

  const results = await Result.find(matchQuery)
    .select('items average')
    .lean();

  const gradeScale = await getSchoolGradeScale(schoolId);
  const sortedScale = [...gradeScale].sort((a, b) => b.minScore - a.minScore);

  // Calculate distribution from all subject grades
  const distribution = {};
  let totalGrades = 0;

  // Initialize distribution with all possible grades
  gradeScale.forEach(grade => {
    distribution[grade.code] = {
      count: 0,
      percentage: 0,
      label: grade.label,
      minScore: grade.minScore,
      maxScore: grade.maxScore
    };
  });

  // Count grades from results
  results.forEach(result => {
    if (result.items && Array.isArray(result.items)) {
      result.items.forEach(item => {
        if (typeof item.total === 'number') {
          const score = Math.min(Math.max(item.total, 0), 100);
          const grade = sortedScale.find(g => score >= g.minScore && score <= g.maxScore);

          if (grade) {
            distribution[grade.code].count++;
            totalGrades++;
          }
        }
      });
    }
  });

  // Calculate percentages
  Object.keys(distribution).forEach(code => {
    if (totalGrades > 0) {
      distribution[code].percentage = Math.round((distribution[code].count / totalGrades) * 100);
    }
  });

  logger.debug('Generated grade distribution', {
    schoolId,
    session,
    term,
    totalGrades,
    resultsCount: results.length
  });

  return ok(res, {
    distribution,
    totalGrades,
    resultsCount: results.length,
    session,
    term,
    gradeScale
  }, 'Grade distribution retrieved successfully');
});

export default {
  getSchoolGradingSystem,
  updateSchoolGradingSystem,
  getAvailableGradingSystems,
  validateCustomGradeScale,
  previewGradeCalculations,
  getSchoolGradeDistribution
};