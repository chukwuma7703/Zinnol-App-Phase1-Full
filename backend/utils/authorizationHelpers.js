// Centralized authorization helper utilities for analytics endpoints.
// NOTE: These functions intentionally mirror existing inline logic to avoid behavioral changes.
// Future refactors can extend these with caching/permission matrices.
import { roles } from "../config/roles.js";

/**
 * Determine if a user can view a specific student's analytics.
 * Mirrors logic previously embedded in `getStudentAnalytics`.
 */
export function canViewStudentAnalytics(viewer, studentDoc, isTeacherAssigned = false) {
    if (!viewer) return false;
    const userRole = viewer.role;
    switch (userRole) {
        case roles.GLOBAL_SUPER_ADMIN:
            return true;
        case roles.MAIN_SUPER_ADMIN:
        case roles.SUPER_ADMIN:
        case roles.PRINCIPAL:
            return viewer.school?.toString && studentDoc?.school?.toString && viewer.school.toString() === studentDoc.school.toString();
        case roles.TEACHER:
            return viewer.school?.toString && studentDoc?.school?.toString && viewer.school.toString() === studentDoc.school.toString() && isTeacherAssigned;
        case roles.PARENT:
        case roles.STUDENT:
            return viewer.studentProfile?.toString && studentDoc?._id?.toString && viewer.studentProfile.toString() === studentDoc._id.toString();
        case 'public':
            return true; // Share token temporary access
        default:
            return false;
    }
}

/**
 * Roles allowed to view school-wide analytics style endpoints.
 */
export function canViewSchoolAnalytics(viewer) {
    if (!viewer) return false;
    return [
        roles.GLOBAL_SUPER_ADMIN,
        roles.MAIN_SUPER_ADMIN,
        roles.SUPER_ADMIN,
        roles.PRINCIPAL
    ].includes(viewer.role);
}

/**
 * Validate ability to share teacher analytics.
 */
export function canShareTeacherAnalytics(viewer) {
    if (!viewer) return false;
    return [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN].includes(viewer.role);
}

/**
 * Validate ability to share student analytics while preserving owner access.
 */
export function canShareStudentAnalytics(viewer, targetId) {
    if (!viewer) return false;
    const isOwner = (viewer.role === roles.PARENT || viewer.role === roles.STUDENT) && viewer.studentProfile?.toString() === targetId;
    const isAdmin = [roles.GLOBAL_SUPER_ADMIN, roles.MAIN_SUPER_ADMIN, roles.SUPER_ADMIN, roles.PRINCIPAL, roles.TEACHER].includes(viewer.role);
    return isOwner || isAdmin;
}

/**
 * Generic helper to validate sort directives.
 */
export function validateSort(sortBy, sortOrder, allowedFields, errors) {
    if (sortBy && !allowedFields.includes(sortBy)) {
        errors.push({ field: 'sortBy', message: `Invalid sortBy. Allowed: ${allowedFields.join(', ')}` });
    }
    if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
        errors.push({ field: 'sortOrder', message: 'sortOrder must be asc or desc' });
    }
}

/**
 * Safe wrapper for concurrently executed aggregation promises.
 * If any promise rejects, logs context (caller supplies logger) and rethrows a generic AppError upstream.
 */
export async function runAggregationsSafely(tasks, logger, contextLabel = 'aggregation batch') {
    try {
        return await Promise.all(tasks);
    } catch (err) {
        logger?.error?.(`Failed during ${contextLabel}`, { error: err?.message, stack: err?.stack });
        throw err; // Let upstream controller convert or existing error middleware handle.
    }
}
