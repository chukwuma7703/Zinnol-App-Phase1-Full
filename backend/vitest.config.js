import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.test.js', 'test/**/*.spec.js'],
        exclude: ['node_modules', 'dist', 'coverage'],
        setupFiles: ['test/setup.vitest.js'],
        testTimeout: 30000,
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'test/',
                'coverage/',
                'dist/',
                '**/*.config.js',
                '**/*.config.cjs'
            ],
            thresholds: {
                global: {
                    branches: 90,
                    functions: 90,
                    lines: 90,
                    statements: 90
                }
            }
        }
    },
    esbuild: {
        target: 'node22'
    }
});
