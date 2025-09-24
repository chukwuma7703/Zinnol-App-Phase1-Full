#!/bin/bash
# Automated Test Runner

echo "Running automated test suites..."

# Run all automated tests
npm test -- test/automated/*.test.js --coverage

# Generate coverage report
npm test -- --coverage --coverageDirectory=coverage-automated

echo "Test execution complete!"
echo "Coverage report available in coverage-automated/"
