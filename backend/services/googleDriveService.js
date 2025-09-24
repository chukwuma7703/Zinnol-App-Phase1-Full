import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { ExternalServiceError } from '../utils/AppError.js';

/**
 * Google Drive Service for Zinnol App
 * Handles organized storage of school data and results using Super Admin's Google Account
 */
class GoogleDriveService {
    constructor() {
        this.drive = null;
        this.isAuthenticated = false;
        this.rootFolderId = null;
        this.oauth2Client = null;
        this.tokens = null;
        this.tokensPath = process.env.GOOGLE_DRIVE_TOKENS_PATH || null; // Prefer file storage
        this.authMode = (process.env.GOOGLE_DRIVE_AUTH || 'oauth2').toLowerCase(); // oauth2 | service_account
    }

    /**
     * Initialize Google Drive OAuth 2.0 authentication
     */
    async initialize() {
        try {
            // Choose auth mode based on env and availability
            if (this.authMode === 'service_account' || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
                // Service Account auth (no client secret required)
                const scopes = ['https://www.googleapis.com/auth/drive'];
                const auth = new google.auth.GoogleAuth({ scopes });
                const authClient = await auth.getClient();
                this.drive = google.drive({ version: 'v3', auth: authClient });
                this.isAuthenticated = true;
                this.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'root';
                console.log('✅ Google Drive service initialized using Service Account auth');
            } else {
                // Use OAuth 2.0 credentials for Super Admin's Gmail account
                this.oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );

                // Load stored tokens if available (file preferred over env)
                const storedTokens = this.loadStoredTokens();
                if (storedTokens) {
                    this.tokens = storedTokens;
                    this.oauth2Client.setCredentials(storedTokens);

                    // Check if tokens are still valid
                    if (this.isTokenValid()) {
                        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
                        this.isAuthenticated = true;

                        // Create or get root Zinnol folder
                        this.rootFolderId = await this.getOrCreateFolder('Zinnol App Data', null);

                        console.log('✅ Google Drive service initialized successfully with Super Admin OAuth account');
                    } else {
                        console.log('⚠️ Google Drive tokens expired. Super Admin needs to re-authenticate.');
                        this.isAuthenticated = false;
                    }
                } else {
                    console.log('⚠️ Google Drive OAuth not configured. Super Admin needs to authenticate first.');
                    this.isAuthenticated = false;
                }
            }
        } catch (error) {
            console.error('❌ Failed to initialize Google Drive:', error.message);
            throw new ExternalServiceError('Google Drive', 'Failed to initialize service');
        }
    }

    /**
     * Check if current tokens are valid
     */
    isTokenValid() {
        if (!this.tokens || !this.tokens.access_token) return false;

        const now = Date.now();
        const expiryTime = this.tokens.expiry_date;

        // Check if token expires within next 5 minutes
        return expiryTime && (expiryTime - now) > (5 * 60 * 1000);
    }

    /**
     * Generate OAuth 2.0 authorization URL for Super Admin
     */
    generateAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ];
        if (!this.oauth2Client) {
            throw new ExternalServiceError('Google Drive', 'OAuth client not initialized (using service account).');
        }
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent' // Force consent screen to get refresh token
        });
    }

    /**
     * Handle OAuth 2.0 callback and store tokens
     */
    async handleAuthCallback(code) {
        try {
            if (!this.oauth2Client) {
                throw new ExternalServiceError('Google Drive', 'OAuth client not initialized (using service account).');
            }
            const { tokens } = await this.oauth2Client.getToken(code);
            this.tokens = tokens;
            this.oauth2Client.setCredentials(tokens);

            // Store tokens using preferred mechanism (file path if provided)
            this.saveTokens(tokens);

            this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
            this.isAuthenticated = true;

            // Create or get root Zinnol folder
            this.rootFolderId = await this.getOrCreateFolder('Zinnol App Data', null);

            console.log('✅ Google Drive authentication successful for Super Admin');

            return {
                success: true,
                message: 'Google Drive authenticated successfully',
                rootFolderId: this.rootFolderId
            };
        } catch (error) {
            console.error('❌ Google Drive authentication failed:', error.message);
            throw new ExternalServiceError('Google Drive', 'Authentication failed');
        }
    }

    /**
     * Refresh access token if needed
     */
    async refreshTokenIfNeeded() {
        if (this.oauth2Client && !this.isTokenValid() && this.tokens?.refresh_token) {
            try {
                this.oauth2Client.setCredentials(this.tokens);
                const { credentials } = await this.oauth2Client.refreshAccessToken();
                this.tokens = credentials;
                this.oauth2Client.setCredentials(credentials);
                // Update stored tokens
                this.saveTokens(credentials);

                console.log('✅ Google Drive access token refreshed');
            } catch (error) {
                console.error('❌ Failed to refresh Google Drive token:', error.message);
                this.isAuthenticated = false;
                throw new ExternalServiceError('Google Drive', 'Token refresh failed');
            }
        }
    }

    /**
     * Ensure the service is authenticated and tokens are valid
     */
    async ensureAuthenticated() {
        if (!this.isAuthenticated) {
            throw new ExternalServiceError('Google Drive', 'Service not authenticated. Super Admin needs to authenticate first.');
        }

        await this.refreshTokenIfNeeded();
    }

    /**
     * Load tokens from file path or environment (fallback)
     */
    loadStoredTokens() {
        try {
            if (this.tokensPath) {
                if (fs.existsSync(this.tokensPath)) {
                    const raw = fs.readFileSync(this.tokensPath, 'utf8');
                    return JSON.parse(raw);
                }
                return null;
            }
            // Fallback to env variable (legacy)
            const envTokens = process.env.GOOGLE_DRIVE_TOKENS;
            return envTokens ? JSON.parse(envTokens) : null;
        } catch (e) {
            console.warn('⚠️ Failed to load Google Drive tokens:', e.message);
            return null;
        }
    }

    /**
     * Save tokens to file path or environment (fallback)
     */
    saveTokens(tokens) {
        try {
            if (this.tokensPath) {
                const dir = path.dirname(this.tokensPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
                return;
            }
            // Fallback to env var (not recommended for production)
            process.env.GOOGLE_DRIVE_TOKENS = JSON.stringify(tokens);
        } catch (e) {
            console.warn('⚠️ Failed to persist Google Drive tokens:', e.message);
        }
    }

    /**
     * Get or create a folder in Google Drive
     * @param {string} folderName - Name of the folder
     * @param {string} parentId - Parent folder ID (null for root)
     * @returns {Promise<string>} Folder ID
     */
    async getOrCreateFolder(folderName, parentId) {
        try {
            // Search for existing folder
            const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const searchQuery = parentId ? `${query} and '${parentId}' in parents` : query;

            const response = await this.drive.files.list({
                q: searchQuery,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                return response.data.files[0].id;
            }

            // Create new folder
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: parentId ? [parentId] : []
            };

            const folder = await this.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });

            return folder.data.id;
        } catch (error) {
            throw new ExternalServiceError('Google Drive', `Failed to create folder: ${error.message}`);
        }
    }

    /**
     * Create organized folder structure for a school
     * Structure: Zinnol App Data > School Name > Academic Year > Term > Data Type
     * @param {string} schoolName - Name of the school
     * @param {string} academicYear - e.g., "2024/2025"
     * @param {string} term - e.g., "1", "2", "3"
     * @returns {Promise<Object>} Folder IDs for different data types
     */
    async createSchoolFolderStructure(schoolName, academicYear, term) {
        try {
            // Ensure authentication and refresh token if needed
            await this.ensureAuthenticated();

            // Create/get school folder
            const schoolFolderId = await this.getOrCreateFolder(schoolName, this.rootFolderId);

            // Create/get academic year folder
            const yearFolderId = await this.getOrCreateFolder(academicYear, schoolFolderId);

            // Create/get term folder
            const termFolderId = await this.getOrCreateFolder(`Term ${term}`, yearFolderId);

            // Create data type folders
            const folders = {
                school: schoolFolderId,
                year: yearFolderId,
                term: termFolderId,
                results: await this.getOrCreateFolder('Exam Results', termFolderId),
                students: await this.getOrCreateFolder('Student Data', termFolderId),
                reports: await this.getOrCreateFolder('Reports', termFolderId),
                backups: await this.getOrCreateFolder('Backups', termFolderId)
            };

            return folders;
        } catch (error) {
            throw new ExternalServiceError('Google Drive', `Failed to create folder structure: ${error.message}`);
        }
    }

    /**
     * Upload a file to Google Drive
     * @param {string} filePath - Local file path
     * @param {string} fileName - Name for the file in Drive
     * @param {string} folderId - Parent folder ID
     * @param {string} mimeType - MIME type of the file
     * @returns {Promise<Object>} File metadata
     */
    async uploadFile(filePath, fileName, folderId, mimeType = null) {
        try {
            // Determine MIME type if not provided
            if (!mimeType) {
                const ext = path.extname(fileName).toLowerCase();
                const mimeTypes = {
                    '.pdf': 'application/pdf',
                    '.csv': 'text/csv',
                    '.json': 'application/json',
                    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    '.xls': 'application/vnd.ms-excel',
                    '.txt': 'text/plain'
                };
                mimeType = mimeTypes[ext] || 'application/octet-stream';
            }

            const fileMetadata = {
                name: fileName,
                parents: [folderId]
            };

            const media = {
                mimeType,
                body: fs.createReadStream(filePath)
            };

            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id,name,webViewLink,webContentLink'
            });

            return {
                id: response.data.id,
                name: response.data.name,
                webViewLink: response.data.webViewLink,
                webContentLink: response.data.webContentLink
            };
        } catch (error) {
            throw new ExternalServiceError('Google Drive', `Failed to upload file: ${error.message}`);
        }
    }

    /**
     * Upload term results and data to Google Drive
     * @param {string} schoolName - School name
     * @param {string} academicYear - Academic year
     * @param {string} term - Term number
     * @param {Object} data - Data to upload (results, students, etc.)
     * @returns {Promise<Object>} Upload results
     */
    async uploadTermData(schoolName, academicYear, term, data) {
        try {
            // Ensure authentication and refresh token if needed
            await this.ensureAuthenticated();

            const folders = await this.createSchoolFolderStructure(schoolName, academicYear, term);
            const uploadResults = {
                school: schoolName,
                academicYear,
                term,
                uploads: [],
                timestamp: new Date().toISOString()
            };

            // Upload exam results
            if (data.results) {
                const resultsFile = await this.createResultsFile(data.results, schoolName, term);
                const uploadResult = await this.uploadFile(
                    resultsFile.path,
                    resultsFile.name,
                    folders.results,
                    'application/pdf'
                );
                uploadResults.uploads.push({
                    type: 'exam_results',
                    file: uploadResult
                });

                // Clean up temporary file
                fs.unlinkSync(resultsFile.path);
            }

            // Upload student data
            if (data.students) {
                const studentsFile = await this.createStudentsFile(data.students, schoolName, term);
                const uploadResult = await this.uploadFile(
                    studentsFile.path,
                    studentsFile.name,
                    folders.students,
                    'text/csv'
                );
                uploadResults.uploads.push({
                    type: 'student_data',
                    file: uploadResult
                });

                fs.unlinkSync(studentsFile.path);
            }

            // Upload term report
            if (data.report) {
                const reportFile = await this.createTermReport(data.report, schoolName, academicYear, term);
                const uploadResult = await this.uploadFile(
                    reportFile.path,
                    reportFile.name,
                    folders.reports,
                    'application/pdf'
                );
                uploadResults.uploads.push({
                    type: 'term_report',
                    file: uploadResult
                });

                fs.unlinkSync(reportFile.path);
            }

            return uploadResults;
        } catch (error) {
            throw new ExternalServiceError('Google Drive', `Failed to upload term data: ${error.message}`);
        }
    }

    /**
     * Create a PDF file with exam results
     * @param {Array} results - Exam results data
     * @param {string} schoolName - School name
     * @param {string} term - Term number
     * @returns {Promise<Object>} File path and name
     */
    async createResultsFile(results, schoolName, term) {
        // For now, create a simple text file that can be converted to PDF later
        // In production, you'd use a PDF library like pdfkit
        const fileName = `${schoolName}_Term${term}_Results_${new Date().toISOString().split('T')[0]}.txt`;
        const filePath = path.join(process.cwd(), 'temp', fileName);

        // Ensure temp directory exists
        if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
            fs.mkdirSync(path.join(process.cwd(), 'temp'));
        }

        const content = `EXAM RESULTS - ${schoolName}\nTerm ${term}\nGenerated: ${new Date().toISOString()}\n\n`;
        const resultsText = results.map(result =>
            `Student: ${result.studentName}\nSubject: ${result.subject}\nScore: ${result.score}/${result.maxScore}\nGrade: ${result.grade}\n\n`
        ).join('');

        fs.writeFileSync(filePath, content + resultsText);

        return { path: filePath, name: fileName.replace('.txt', '.pdf') };
    }

    /**
     * Create a CSV file with student data
     * @param {Array} students - Student data
     * @param {string} schoolName - School name
     * @param {string} term - Term number
     * @returns {Promise<Object>} File path and name
     */
    async createStudentsFile(students, schoolName, term) {
        const fileName = `${schoolName}_Term${term}_Students_${new Date().toISOString().split('T')[0]}.csv`;
        const filePath = path.join(process.cwd(), 'temp', fileName);

        if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
            fs.mkdirSync(path.join(process.cwd(), 'temp'));
        }

        const headers = 'Admission Number,First Name,Last Name,Class,Average Score,Status\n';
        const csvContent = students.map(student =>
            `${student.admissionNumber},${student.firstName},${student.lastName},${student.class},${student.averageScore || ''},${student.status || 'Active'}`
        ).join('\n');

        fs.writeFileSync(filePath, headers + csvContent);

        return { path: filePath, name: fileName };
    }

    /**
     * Create a term report PDF
     * @param {Object} reportData - Report data
     * @param {string} schoolName - School name
     * @param {string} academicYear - Academic year
     * @param {string} term - Term number
     * @returns {Promise<Object>} File path and name
     */
    async createTermReport(reportData, schoolName, academicYear, term) {
        const fileName = `${schoolName}_Term${term}_Report_${academicYear.replace('/', '-')}.txt`;
        const filePath = path.join(process.cwd(), 'temp', fileName);

        if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
            fs.mkdirSync(path.join(process.cwd(), 'temp'));
        }

        const content = `TERM REPORT - ${schoolName}\nAcademic Year: ${academicYear}\nTerm: ${term}\nGenerated: ${new Date().toISOString()}\n\n`;
        const reportText = `
Total Students: ${reportData.totalStudents || 0}
Exams Conducted: ${reportData.totalExams || 0}
Average Score: ${reportData.averageScore || 0}%
Pass Rate: ${reportData.passRate || 0}%

Class Performance:
${reportData.classPerformance ? reportData.classPerformance.map(c => `${c.className}: ${c.averageScore}%`).join('\n') : 'No data available'}

Top Performers:
${reportData.topPerformers ? reportData.topPerformers.map(s => `${s.name}: ${s.score}%`).join('\n') : 'No data available'}
`;

        fs.writeFileSync(filePath, content + reportText);

        return { path: filePath, name: fileName.replace('.txt', '.pdf') };
    }

    /**
     * List files in a folder
     * @param {string} folderId - Folder ID
     * @returns {Promise<Array>} List of files
     */
    async listFiles(folderId) {
        try {
            // Ensure authentication and refresh token if needed
            await this.ensureAuthenticated();

            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, webViewLink, createdTime)',
                orderBy: 'createdTime desc'
            });

            return response.data.files;
        } catch (error) {
            throw new ExternalServiceError('Google Drive', `Failed to list files: ${error.message}`);
        }
    }

    /**
     * Delete a file from Google Drive
     * @param {string} fileId - File ID to delete
     */
    async deleteFile(fileId) {
        try {
            await this.drive.files.delete({ fileId });
        } catch (error) {
            throw new ExternalServiceError('Google Drive', `Failed to delete file: ${error.message}`);
        }
    }
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService();
export default googleDriveService;
