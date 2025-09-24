// ESLint flat config for backend (ESLint v9+)
// Minimal, Node ESM friendly, with Jest globals for tests
import js from '@eslint/js';
import globals from 'globals';

export default [
    // Base recommended rules
    js.configs.recommended,

    // Global ignores (flat config requires a dedicated object for ignores)
    {
        ignores: [
            'node_modules/**',
            'coverage/**',
            'coverage-full/**',
            'coverage-full-routes/**',
            'dist/**',
            'logs/**',
            'uploads/**',
            '.firebase/**',
            'scripts/**',
            'temp_*.js',

            // Ignore tests and mocks across the repo to reduce noise in CI lint
            'test/**',
            '**/*.test.js',
            '**/*.spec.js',
            '**/*.unit.test.js',
            '**/*.integration.test.js',
            '**/__mocks__/**',
        ],
    },

    // Default JS/Node settings
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
            'no-console': 'off',
            'no-empty': 'warn',
            'no-useless-escape': 'off',
            'no-constant-binary-expression': 'off',
        },
    },

    // If we want to lint tests later, enable this block and remove ignores above
    // {
    //   files: [
    //     '**/*.test.js',
    //     '**/*.spec.js',
    //     '**/*.unit.test.js',
    //     '**/*.integration.test.js',
    //     'test/**/*.js',
    //   ],
    //   languageOptions: {
    //     globals: {
    //       ...globals.node,
    //       ...globals.jest,
    //       ...globals.browser,
    //     },
    //   },
    //   rules: {
    //     // Test files often use expect/describe/it and timers
    //     'no-undef': 'off',
    //   },
    // },
];
