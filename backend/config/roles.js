// A constant object to hold all possible user roles.
// This is the single source of truth for roles across the application.
export const roles = Object.freeze({
    GLOBAL_SUPER_ADMIN: 'GLOBAL_SUPER_ADMIN',
    MAIN_SUPER_ADMIN: 'MAIN_SUPER_ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN',
    PRINCIPAL: 'PRINCIPAL',
    VICE_PRINCIPAL: 'VICE_PRINCIPAL',
    TEACHER: 'TEACHER',
    STUDENT: 'STUDENT',
    PARENT: 'PARENT',
    ACCOUNTANT: 'ACCOUNTANT',
    LIBRARIAN: 'LIBRARIAN',
    BUSER_ADMIN: 'BUSER_ADMIN',
});