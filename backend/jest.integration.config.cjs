const base = require('./jest.config.js').default || require('./jest.config.js');

module.exports = {
    ...base,
    // Only run integration tests here
    testMatch: ['<rootDir>/test/integration/**/*.test.js'],
    // Use a dedicated setup that starts/stops a single MongoMemoryServer
    setupFilesAfterEnv: ['<rootDir>/test/setup.integration.js'],
    // Do not reuse globalSetup/Teardown from unit/smoke to avoid double handlers
    globalSetup: undefined,
    globalTeardown: undefined,
    // Integration-friendly settings
    testTimeout: 90000,
    maxWorkers: 1,
    detectOpenHandles: true,
    forceExit: true,
    verbose: true,
    clearMocks: true,
    resetMocks: false,
    restoreMocks: false,
    // Keep the same transforms and mappers as base (no smoke doubles)
    transform: base.transform,
    transformIgnorePatterns: base.transformIgnorePatterns,
    moduleNameMapper: {
        ...base.moduleNameMapper,
    },
    // Light coverage collection (optional for dev visibility)
    collectCoverage: false,
    collectCoverageFrom: [
        'controllers/**/*.js',
        'routes/**/*.js',
        'models/**/*.js',
        'services/**/*.js',
        'utils/**/*.js',
        '!**/*.test.js',
        '!**/test/**',
        '!**/coverage/**'
    ],
    coverageReporters: ['text', 'json-summary', 'lcov'],
};
