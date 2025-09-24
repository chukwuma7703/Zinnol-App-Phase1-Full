// This file is the single source of truth for all toggleable features in the application.
// The 'name' should be a unique, URL-friendly string.
// 'isCore: true' prevents a feature from being disabled via the API, protecting critical functions.
export const definedFeatures = [
    { name: 'user-login', description: 'Allows all users to log in to the application.', isCore: true },
    { name: 'user-registration', description: 'Allows new users to be registered (excluding the initial global admin).', isCore: false },
    { name: 'ocr-bulk-upload', description: 'Enables the OCR feature for bulk result submission from an image.' },
    { name: 'share-analytics', description: 'Allows users to generate and share analytics reports via a public link.' },
    { name: 'assign-teacher', description: 'Allows authorized admins to assign the "Teacher" role to a user.' },
    { name: 'assign-principal', description: 'Allows authorized admins to assign the "Principal" role to a user.' },
    { name: 'assign-super-admin', description: 'Allows authorized admins to assign the "Super Admin" role.' },
    { name: 'assign-main-super-admin', description: 'Allows the Global Super Admin to assign a "Main Super Admin" to a school.' },
    { name: 'generate-annual-results', description: 'Enables the generation of cumulative annual results for a classroom.' },
    { name: 'approve-reject-results', description: 'Allows Principals to approve or reject submitted results.' },
  ];
  
  