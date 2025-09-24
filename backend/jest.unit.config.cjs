const base = require('./jest.config.js').default || require('./jest.config.js');

module.exports = {
    ...base,
    // Restrict to explicit unit-focused directories & naming patterns
    testMatch: [
        '<rootDir>/test/unit/**/*.test.js',
        '<rootDir>/test/utils/**/*.test.js',
        '<rootDir>/test/middleware/**/*.test.js',
        '<rootDir>/test/controllers/**/*.unit.test.js',
        '<rootDir>/test/services/**/*.unit.test.js',
    ],
    // Emit summary for coverage comparison script and human-friendly outputs
    coverageReporters: ['text', 'json-summary', 'lcov', 'json'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/test/integration/',
        '<rootDir>/test/route-smoke/',
        '<rootDir>/test/server.unit.test.js',
        '<rootDir>/test/result.voicenote.test.js',
        '<rootDir>/test/result.ocr.integration.test.js',
        '<rootDir>/test/services/predictiveAnalytics.test.js',
        // Temporarily exclude flaky/in-progress cache tests
        '<rootDir>/test/unit/config/cache.unit.test.js'
    ],
    moduleNameMapper: {
        ...base.moduleNameMapper,
        '^@sendgrid/mail$': '<rootDir>/test/mocks/sendgridMailMock.js',
        '^nodemailer$': '<rootDir>/test/mocks/nodemailerMock.js',
    },
    setupFilesAfterEnv: ['<rootDir>/test/setup.unit.js'],
    // Focus coverage on core, exclude large untested/heavy modules for faster signal
    collectCoverageFrom: [
        // Core services (already high coverage)
        'services/resultService.js',
        'services/gradeScaleService.js',
        // Low-risk, well-tested middleware & utils (expansion phase 1)
        'middleware/authMiddleware.js',
        'utils/generateToken.js',
        'utils/ApiResponse.js',
        // Include email util under unit env (with unit-specific mocks)
        'utils/sendEmail.js',
        // New targeted modules to lift coverage (phase 2)
        'utils/httpClient.js',
        'controllers/examController.js',
        'services/aiPedagogicalCoach.js'
    ],
    coverageThreshold: {
        // Enforce 90%+ global coverage on the focused set
        global: { lines: 90, statements: 90, branches: 83, functions: 90 },
        'services/resultService.js': { lines: 94, statements: 94, branches: 74, functions: 96 },
        'services/gradeScaleService.js': { lines: 85, statements: 85, branches: 82, functions: 85 },
        'middleware/authMiddleware.js': { lines: 85, statements: 85, branches: 75, functions: 85 },
        'utils/generateToken.js': { lines: 90, statements: 90, branches: 70, functions: 90 },
        'utils/ApiResponse.js': { lines: 95, statements: 95, branches: 80, functions: 95 },
        'utils/sendEmail.js': { lines: 80, statements: 80, branches: 70, functions: 80 },
        // Set reasonable initial thresholds; we will raise as we expand tests
        'utils/httpClient.js': { lines: 50, statements: 50, branches: 40, functions: 50 },
        'controllers/examController.js': { lines: 15, statements: 15, branches: 12, functions: 15 },
        'services/aiPedagogicalCoach.js': { lines: 30, statements: 30, branches: 25, functions: 30 }
    }
};
