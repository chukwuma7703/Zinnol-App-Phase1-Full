# Role Hierarchy and Account Provisioning

This document captures the intended roles flow you described and how it maps to the current code.

## Hierarchy (business intent)
- Global Super Admin
  - Creates/assigns Main Super Admin(s) for school(s)
- Main Super Admin
  - Creates or activates:
    - Super Admins (3 or more allowed)
    - Principal Admin(s)
    - Teachers
    - Parents
    - Students

## Code mapping
- Roles are defined in `backend/config/roles.js`:
  - `GLOBAL_SUPER_ADMIN`, `MAIN_SUPER_ADMIN`, `SUPER_ADMIN`, `PRINCIPAL`, `TEACHER`, `PARENT`, `STUDENT`, ...
- Permissions scaffold in `backend/config/permissions.js`:
  - `createSuperAdmin`: `GLOBAL_SUPER_ADMIN`, `MAIN_SUPER_ADMIN`
  - `createTeacher`: `GLOBAL_SUPER_ADMIN`, `MAIN_SUPER_ADMIN`, `SUPER_ADMIN`, `PRINCIPAL`
  - `uploadResults`: `GLOBAL_SUPER_ADMIN`, `MAIN_SUPER_ADMIN`, `SUPER_ADMIN`, `PRINCIPAL`, `TEACHER`
  - `approveResults`: `GLOBAL_SUPER_ADMIN`, `MAIN_SUPER_ADMIN`, `SUPER_ADMIN`, `PRINCIPAL`
  - `manageFeatures`: `GLOBAL_SUPER_ADMIN`, `MAIN_SUPER_ADMIN`

## Notes
- If you want to restrict which roles Main Super Admin can create (e.g., limit Parents/Students to bulk import only), we can add granular permissions like `createParent`, `createStudent`.
- We can add an activation workflow (invitation + status) and audit logs per creation.
