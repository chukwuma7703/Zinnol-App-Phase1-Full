export default {
    testEnvironment: 'node',
    roots: ['<rootDir>'],
    testMatch: [
        '**/test/route-smoke/**/*.test.js',
        '<rootDir>/test/unit/utils/**/*.test.js',
        '<rootDir>/test/unit/middleware/**/*.test.js'
    ],
    transform: {
        '^.+\\.[jt]sx?$': ['babel-jest', {
            presets: [
                ['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }],
                '@babel/preset-react'
            ],
            plugins: ['@babel/plugin-syntax-jsx']
        }]
    },
    transformIgnorePatterns: [
        '/node_modules/(?!google-auth-library|googleapis|@google/vision|@google/generative-ai|@google-cloud|openai|axios|@sentry|node-fetch).+\\.js$'
    ],
    moduleNameMapper: {
        // Global side-effect mocks
        '^(.*)/config/socket\\.js$': '<rootDir>/test/mocks/socketMock.js',
        '^.*config/monitoring\\.js$': '<rootDir>/test/mocks/monitoringMock.js',
        '^node-cron$': '<rootDir>/test/mocks/cronMock.js',
        '^swagger-ui-express$': '<rootDir>/test/mocks/swaggerMock.js',
        '^googleapis$': '<rootDir>/test/mocks/googleapisMock.js',
        '^.*utils/logger\\.js$': '<rootDir>/test/mocks/loggerMock.js',
        '^bullmq$': '<rootDir>/test/mocks/bullmqMock.js',

        // Test-only controller/middleware doubles for smoke tests
        '^.*middleware/authMiddleware\\.js$': '<rootDir>/test/mocks/authMiddlewareMock.js',
        '^.*middleware/validationMiddleware\\.js$': '<rootDir>/test/mocks/validationMock.js',
        '^.*middleware/rateLimitMiddleware\\.js$': '<rootDir>/test/mocks/rateLimitMiddlewareMock.js',
        '^.*middleware/examMiddleware\\.js$': '<rootDir>/test/mocks/examMiddlewareMock.js',

        '^.*controllers/examController\\.js$': '<rootDir>/test/mocks/examControllerMock.js',
        '^.*controllers/analysisController\\.js$': '<rootDir>/test/mocks/analysisControllerMock.js',
        '^.*controllers/userController\\.js$': '<rootDir>/test/mocks/userControllerMock.js',
        '^.*controllers/publicController\\.js$': '<rootDir>/test/mocks/publicControllerMock.js',
        '^.*controllers/classController\\.js$': '<rootDir>/test/mocks/classControllerMock.js',
        '^.*controllers/assignmentController\\.js$': '<rootDir>/test/mocks/assignmentControllerMock.js'
    },
    collectCoverage: true,
    collectCoverageFrom: [
        'routes/**/{analyticsRoutes,assignmentRoutes,classRoutes,examRoutes,publicRoutes,userRoutes}.js',
        'middleware/requestTracking.js',
        'utils/generateToken.js'
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/coverage/',
        '/test/',
        '.*\\.test\\.js$'
    ],
    coverageReporters: ['text', 'lcov', 'json-summary'],
    coverageDirectory: '<rootDir>/coverage-current',
    coverageThreshold: {
        global: {
            lines: 98,
            statements: 98,
            functions: 90,
            branches: 90
        }
    },
    testTimeout: 20000,
    verbose: true,
    clearMocks: true,
    resetMocks: false,
    restoreMocks: false,
    testPathIgnorePatterns: [
        '<rootDir>/test/unit/middleware/validationMiddleware.unit.test.js',
        '<rootDir>/test/unit/middleware/authMiddleware.unit.test.js',
        // Exclude deeper authz unit tests that require real modules (conflict with smoke doubles)
        '<rootDir>/test/unit/middleware/examMiddleware.unit.test.js',
        '<rootDir>/test/unit/middleware/schoolMiddleware.unit.test.js'
    ],
    modulePathIgnorePatterns: ['<rootDir>/__mocks__'],
    setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
    globalTeardown: '<rootDir>/test/teardown.cjs',
    testEnvironmentOptions: { NODE_ENV: 'test' },
};
