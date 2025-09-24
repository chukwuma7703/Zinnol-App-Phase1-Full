/**
 * Grade Scale Service - Per-School Customizable Grading Systems
 * Supports WAEC, Cambridge, IB, and custom grade scales
 */

import School from '../models/School.js';
import { getCache, setCache, deleteCache } from '../config/cache.js';
import logger from '../utils/logger.js';

// Predefined grade scales for different educational systems
const PREDEFINED_SCALES = {
  WAEC: [
    { code: 'A1', label: 'Excellent', minScore: 75, maxScore: 100, remarks: 'Excellent' },
    { code: 'B2', label: 'Very Good', minScore: 70, maxScore: 74, remarks: 'Very Good' },
    { code: 'B3', label: 'Good', minScore: 65, maxScore: 69, remarks: 'Good' },
    { code: 'C4', label: 'Credit', minScore: 60, maxScore: 64, remarks: 'Credit' },
    { code: 'C5', label: 'Credit', minScore: 55, maxScore: 59, remarks: 'Credit' },
    { code: 'C6', label: 'Credit', minScore: 50, maxScore: 54, remarks: 'Credit' },
    { code: 'D7', label: 'Pass', minScore: 45, maxScore: 49, remarks: 'Pass' },
    { code: 'E8', label: 'Pass', minScore: 40, maxScore: 44, remarks: 'Pass' },
    { code: 'F9', label: 'Fail', minScore: 0, maxScore: 39, remarks: 'Fail' }
  ],

  CAMBRIDGE: [
    { code: 'A*', label: 'Outstanding', minScore: 90, maxScore: 100, remarks: 'Outstanding' },
    { code: 'A', label: 'Excellent', minScore: 80, maxScore: 89, remarks: 'Excellent' },
    { code: 'B', label: 'Very Good', minScore: 70, maxScore: 79, remarks: 'Very Good' },
    { code: 'C', label: 'Good', minScore: 60, maxScore: 69, remarks: 'Good' },
    { code: 'D', label: 'Satisfactory', minScore: 50, maxScore: 59, remarks: 'Satisfactory' },
    { code: 'E', label: 'Pass', minScore: 40, maxScore: 49, remarks: 'Pass' },
    { code: 'F', label: 'Fail', minScore: 0, maxScore: 39, remarks: 'Fail' }
  ],

  IB: [
    { code: '7', label: 'Excellent', minScore: 80, maxScore: 100, remarks: 'Excellent' },
    { code: '6', label: 'Very Good', minScore: 73, maxScore: 79, remarks: 'Very Good' },
    { code: '5', label: 'Good', minScore: 65, maxScore: 72, remarks: 'Good' },
    { code: '4', label: 'Satisfactory', minScore: 56, maxScore: 64, remarks: 'Satisfactory' },
    { code: '3', label: 'Mediocre', minScore: 46, maxScore: 55, remarks: 'Needs Improvement' },
    { code: '2', label: 'Poor', minScore: 35, maxScore: 45, remarks: 'Poor' },
    { code: '1', label: 'Very Poor', minScore: 0, maxScore: 34, remarks: 'Very Poor' }
  ],

  US_GPA: [
    { code: 'A+', label: 'Excellent', minScore: 97, maxScore: 100, remarks: 'Outstanding' },
    { code: 'A', label: 'Excellent', minScore: 93, maxScore: 96, remarks: 'Excellent' },
    { code: 'A-', label: 'Very Good', minScore: 90, maxScore: 92, remarks: 'Very Good' },
    { code: 'B+', label: 'Good', minScore: 87, maxScore: 89, remarks: 'Good' },
    { code: 'B', label: 'Good', minScore: 83, maxScore: 86, remarks: 'Good' },
    { code: 'B-', label: 'Satisfactory', minScore: 80, maxScore: 82, remarks: 'Satisfactory' },
    { code: 'C+', label: 'Average', minScore: 77, maxScore: 79, remarks: 'Average' },
    { code: 'C', label: 'Average', minScore: 73, maxScore: 76, remarks: 'Average' },
    { code: 'C-', label: 'Below Average', minScore: 70, maxScore: 72, remarks: 'Below Average' },
    { code: 'D', label: 'Poor', minScore: 60, maxScore: 69, remarks: 'Poor' },
    { code: 'F', label: 'Fail', minScore: 0, maxScore: 59, remarks: 'Fail' }
  ]
};

// Cache for school-specific grade scales (5 minute TTL)
const CACHE_TTL = 300;

/**
 * Get grade scale for a specific school
 * @param {string} schoolId - School ID
 * @returns {Promise<Array>} Grade scale array
 */
export const getSchoolGradeScale = async (schoolId) => {
  if (!schoolId) {
    return PREDEFINED_SCALES.WAEC; // Default fallback
  }

  // Check cache first
  const cacheKey = `grade_scale:${schoolId}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const school = await School.findById(schoolId)
      .select('gradeScale gradingSystem')
      .lean();

    if (!school) {
      logger.warn(`School not found: ${schoolId}, using WAEC default`);
      return PREDEFINED_SCALES.WAEC; // Return default if school not found
    }

    let gradeScale;

    if (school.gradeScale && school.gradeScale.length > 0) {
      // Use custom scale
      gradeScale = school.gradeScale;
      // Sort by minScore descending for proper grade calculation
      gradeScale = gradeScale.sort((a, b) => b.minScore - a.minScore);
    } else if (school.gradingSystem && school.gradingSystem.type === 'CUSTOM' && school.gradingSystem.customScale) {
      // Use custom scale from gradingSystem
      gradeScale = school.gradingSystem.customScale;
      // Sort by minScore descending for proper grade calculation
      gradeScale = gradeScale.sort((a, b) => b.minScore - a.minScore);
    } else if (school.gradingSystem && school.gradingSystem.type) {
      // Use predefined scale based on gradingSystem.type
      gradeScale = PREDEFINED_SCALES[school.gradingSystem.type] || PREDEFINED_SCALES.WAEC;
    } else {
      // Default to WAEC
      gradeScale = PREDEFINED_SCALES.WAEC;
    }

    // Cache the result
    await setCache(cacheKey, gradeScale, CACHE_TTL);

    return gradeScale;
  } catch (error) {
    logger.error(`Error fetching grade scale for school ${schoolId}:`, error);
    return PREDEFINED_SCALES.WAEC; // Fallback to WAEC
  }
};

/**
 * Update school's grading system
 * @param {string} schoolId - School ID
 * @param {Object} gradingSystem - New grading system configuration
 * @param {string} userId - User making the change
 * @returns {Promise<Object>} Updated school document
 */
export const updateSchoolGradingSystem = async (schoolId, gradingSystem, userId) => {
  // Validate grading system type
  const validTypes = ['WAEC', 'CAMBRIDGE', 'IB', 'US_GPA', 'CUSTOM'];
  if (!validTypes.includes(gradingSystem.type)) {
    throw new Error('Invalid grading system type');
  }

  // Validate custom scale if type is CUSTOM
  if (gradingSystem.type === 'CUSTOM') {
    if (!gradingSystem.customScale) {
      throw new Error('Custom scale is required when type is CUSTOM');
    }
    const validation = validateGradeScale(gradingSystem.customScale);
    if (!validation.valid) {
      let errorMsg = validation.errors[0];
      if (errorMsg.includes('code is required') || errorMsg.includes('label is required') || errorMsg.includes('minScore must be a number') || errorMsg.includes('maxScore must be a number')) {
        errorMsg = 'Each grade must have code, label, minScore, and maxScore';
      } else if (errorMsg.includes('cannot be negative') || errorMsg.includes('cannot exceed') || errorMsg.includes('cannot be greater than maxScore')) {
        errorMsg = 'Invalid score range in custom scale';
      } else if (errorMsg.includes('Grade ranges overlap')) {
        errorMsg = 'Grade ranges cannot overlap';
      }
      throw new Error(errorMsg);
    }
  }

  // Update school
  const updateData = {
    'gradingSystem.type': gradingSystem.type,
    'gradingSystem.updatedBy': userId,
    'gradingSystem.updatedAt': new Date()
  };

  if (gradingSystem.type === 'CUSTOM') {
    updateData['gradingSystem.customScale'] = gradingSystem.customScale;
    updateData['gradingSystem.thresholds'] = gradingSystem.thresholds;
    if (gradingSystem.honorRollGrade) updateData['gradingSystem.honorRollGrade'] = gradingSystem.honorRollGrade;
    if (gradingSystem.passingGrade) updateData['gradingSystem.passingGrade'] = gradingSystem.passingGrade;
  }

  const updatedSchool = await School.findByIdAndUpdate(
    schoolId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedSchool) {
    throw new Error('School not found');
  }

  // Clear cache
  await deleteCache(`grade_scale:${schoolId}`);

  return updatedSchool;
};

/**
 * Set custom grade scale for a school (alias for updateSchoolGradingSystem)
 * @param {string} schoolId - School ID
 * @param {Array} gradeScale - Custom grade scale
 * @returns {Promise<Object>} Updated school
 */
export const setSchoolGradeScale = async (schoolId, gradeScale) => {
  const validation = validateGradeScale(gradeScale);
  if (!validation.valid) {
    throw new Error(`Invalid grade scale: ${validation.errors.join(', ')}`);
  }

  const school = await School.findById(schoolId);
  if (!school) {
    throw new Error('School not found');
  }

  school.gradeScale = gradeScale;
  await school.save();

  // Clear cache
  await deleteCache(`school_grade_scale:${schoolId}`);

  return school;
};

/**
 * Reset school grade scale to default (null)
 * @param {string} schoolId - School ID
 * @returns {Promise<Object>} Updated school
 */
export const resetSchoolGradeScale = async (schoolId) => {
  const school = await School.findById(schoolId);
  if (!school) {
    throw new Error('School not found');
  }

  school.gradeScale = null;
  await school.save();

  // Clear cache
  await deleteCache(`school_grade_scale:${schoolId}`);

  return school;
};

/**
 * Calculate grade for a score using school-specific scale
 * @param {number} score - The score to grade
 * @param {string} schoolId - School ID for scale lookup
 * @returns {Promise<Object>} Grade object with code and label
 */
export const calculateGradeForSchool = async (score, schoolId) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return { code: 'F', label: 'Invalid Score' };
  }

  // Clamp score to 0-100 range
  const clampedScore = Math.min(Math.max(score, 0), 100);

  const gradeScale = await getSchoolGradeScale(schoolId);

  // Find matching grade (scale is sorted by minScore descending)
  const grade = gradeScale.find(g => clampedScore >= g.minScore && clampedScore <= g.maxScore);

  if (!grade) {
    // Fallback to lowest grade if no match found
    const lowestGrade = gradeScale[gradeScale.length - 1];
    return {
      code: lowestGrade?.code || 'F',
      label: lowestGrade?.label || 'Fail',
      remarks: lowestGrade?.remarks || 'Fail'
    };
  }

  return {
    code: grade.code,
    label: grade.label,
    remarks: grade.remarks || grade.label
  };
};

/**
 * Get available grading systems
 * @returns {Object} Available grading systems with their scales
 */
export const getAvailableGradingSystems = () => {
  return {
    systems: Object.keys(PREDEFINED_SCALES),
    scales: PREDEFINED_SCALES
  };
};

/**
 * Get a predefined grade scale by name, or custom scale for a school
 * @param {string} scaleName - Name of the predefined scale (WAEC, Cambridge, etc.) or "CUSTOM"
 * @param {string} [schoolId] - School ID when scaleName is "CUSTOM"
 * @returns {Array|null|Promise} The grade scale array or null if not found
 */
export const getGradeScale = async (scaleName, schoolId = null) => {
  if (scaleName === 'CUSTOM') {
    if (!schoolId) return null;
    const custom = await getSchoolGradeScale(schoolId);
    return custom || PREDEFINED_SCALES.WAEC;
  }
  return PREDEFINED_SCALES[scaleName] || null;
};

/**
 * Calculate grade for a given score using a predefined scale or custom school scale
 * @param {number} score - The score to grade
 * @param {string} scaleName - Name of the predefined scale or "CUSTOM"
 * @param {string} [schoolId] - School ID when scaleName is "CUSTOM"
 * @returns {Promise<Object|null>} Grade object or null if scale not found
 */
export const calculateGrade = async (score, scaleName, schoolId = null) => {
  if (scaleName === 'CUSTOM') {
    if (!schoolId) return null;
    return await calculateGradeForSchool(score, schoolId);
  }

  if (typeof score !== 'number' || Number.isNaN(score)) {
    return { code: 'F', label: 'Invalid Score' };
  }

  const gradeScale = await getGradeScale(scaleName);
  if (!gradeScale) {
    return null;
  }

  // Clamp score to 0-100 range
  const clampedScore = Math.min(Math.max(score, 0), 100);

  // Find matching grade (scale is sorted by minScore descending)
  const grade = gradeScale.find(g => clampedScore >= g.minScore && clampedScore <= g.maxScore);

  if (!grade) {
    // Fallback to lowest grade if no match found
    const lowestGrade = gradeScale[gradeScale.length - 1];
    return {
      code: lowestGrade?.code || 'F',
      label: lowestGrade?.label || 'Fail',
      remarks: lowestGrade?.remarks || 'Fail'
    };
  }

  return {
    code: grade.code,
    label: grade.label,
    remarks: grade.remarks || grade.label
  };
};

/**
 * Validate grade scale format
 * @param {Array} scale - Grade scale to validate
 * @returns {Object} Validation result
 */
export const validateGradeScale = (scale) => {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(scale)) {
    return { valid: false, errors: ['Grade scale must be an array'], warnings };
  }

  if (scale.length === 0) {
    return { valid: false, errors: ['Grade scale cannot be empty'], warnings };
  }

  // Check each grade
  for (let i = 0; i < scale.length; i++) {
    const grade = scale[i];
    const prefix = `Grade ${i + 1}`;

    if (!grade.code) errors.push(`${prefix}: code is required`);
    if (!grade.label) errors.push(`${prefix}: label is required`);
    if (typeof grade.minScore !== 'number') errors.push(`${prefix}: minScore must be a number`);
    if (typeof grade.maxScore !== 'number') errors.push(`${prefix}: maxScore must be a number`);

    if (grade.minScore < 0) errors.push(`${prefix}: minScore cannot be negative`);
    if (grade.maxScore > 100) errors.push(`${prefix}: maxScore cannot exceed 100`);
    if (grade.minScore > grade.maxScore) errors.push(`${prefix}: minScore cannot be greater than maxScore`);
  }

  // Check for overlaps
  const sortedScale = [...scale].sort((a, b) => a.minScore - b.minScore);
  for (let i = 1; i < sortedScale.length; i++) {
    if (sortedScale[i].minScore <= sortedScale[i - 1].maxScore) {
      errors.push(`Grade ranges overlap: ${sortedScale[i - 1].code} and ${sortedScale[i].code}`);
    }
  }

  // Check for gaps (as warnings)
  for (let i = 1; i < sortedScale.length; i++) {
    if (sortedScale[i].minScore > sortedScale[i - 1].maxScore + 1) {
      warnings.push(`Gap between ${sortedScale[i - 1].code} and ${sortedScale[i].code}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Get school's passing and honor roll grades
 * @param {string} schoolId - School ID
 * @returns {Promise<Object>} Passing and honor roll grade information
 */
export const getSchoolGradeThresholds = async (schoolId) => {
  try {
    const school = await School.findById(schoolId)
      .select('gradingSystem')
      .lean();

    const passingGrade = school?.gradingSystem?.passingGrade || 'E8';
    const honorRollGrade = school?.gradingSystem?.honorRollGrade || 'B2';

    const gradeScale = await getSchoolGradeScale(schoolId);

    const passingGradeInfo = gradeScale.find(g => g.code === passingGrade);
    const honorRollGradeInfo = gradeScale.find(g => g.code === honorRollGrade);

    return {
      passing: {
        code: passingGrade,
        minScore: passingGradeInfo?.minScore || 40,
        label: passingGradeInfo?.label || 'Pass'
      },
      honorRoll: {
        code: honorRollGrade,
        minScore: honorRollGradeInfo?.minScore || 70,
        label: honorRollGradeInfo?.label || 'Very Good'
      }
    };
  } catch (error) {
    logger.error(`Error getting grade thresholds for school ${schoolId}:`, error);
    return {
      passing: { code: 'E8', minScore: 40, label: 'Pass' },
      honorRoll: { code: 'B2', minScore: 70, label: 'Very Good' }
    };
  }
};

export default {
  getSchoolGradeScale,
  updateSchoolGradingSystem,
  setSchoolGradeScale,
  resetSchoolGradeScale,
  calculateGradeForSchool,
  getAvailableGradingSystems,
  getGradeScale,
  calculateGrade,
  validateGradeScale,
  getSchoolGradeThresholds,
  PREDEFINED_SCALES
};