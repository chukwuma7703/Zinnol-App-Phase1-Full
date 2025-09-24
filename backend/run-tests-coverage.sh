#!/bin/bash

# Run Tests with Coverage Script
# Achieves 90%+ test coverage for Zinnol Backend

echo "🧪 Running Zinnol Backend Tests with Coverage..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Install test dependencies if not present
echo -e "${YELLOW}Ensuring test dependencies are installed...${NC}"
npm install --save-dev \
    jest \
    @jest/globals \
    supertest \
    mongodb-memory-server \
    @types/jest \
    jest-environment-node \
    cross-env

# Create test environment file if not exists
if [ ! -f ".env.test" ]; then
    echo -e "${YELLOW}Creating test environment file...${NC}"
    cat > .env.test << EOF
NODE_ENV=test
PORT=4001
MONGO_URI=mongodb://localhost:27017/zinnol-test
JWT_SECRET=test-secret-key-for-testing
REDIS_URL=redis://localhost:6379/1
BCRYPT_ROUNDS=4
EMAIL_FROM=test@zinnol.com
FRONTEND_URL=http://localhost:3000
EOF
fi

# Update package.json test scripts
echo -e "${YELLOW}Updating test scripts in package.json...${NC}"
node -e "
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

packageJson.scripts = {
    ...packageJson.scripts,
    'test': 'cross-env NODE_ENV=test jest',
    'test:watch': 'cross-env NODE_ENV=test jest --watch',
    'test:coverage': 'cross-env NODE_ENV=test jest --coverage',
    'test:coverage:detailed': 'cross-env NODE_ENV=test jest --coverage --verbose',
    'test:unit': 'cross-env NODE_ENV=test jest --testPathPattern=test/unit',
    'test:integration': 'cross-env NODE_ENV=test jest --testPathPattern=test/integration',
    'test:e2e': 'cross-env NODE_ENV=test jest --testPathPattern=test/e2e'
};

fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
console.log('✅ Test scripts updated');
"

# Create Jest configuration if not exists
if [ ! -f "jest.config.js" ]; then
    echo -e "${YELLOW}Creating Jest configuration...${NC}"
    cat > jest.config.js << 'EOF'
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/controllers', '<rootDir>/models', '<rootDir>/services'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  transform: {},
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/test/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!.eslintrc.js',
    '!prettier.config.js',
    '!**/migrations/**',
    '!**/scripts/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
EOF
fi

# Run tests with coverage
echo -e "${GREEN}Running tests with coverage...${NC}"
npm run test:coverage

# Check coverage results
COVERAGE_RESULT=$?

if [ $COVERAGE_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ Tests passed with coverage!${NC}"
    
    # Display coverage summary
    echo -e "${GREEN}Coverage Summary:${NC}"
    npx jest --coverage --coverageReporters="text-summary" 2>/dev/null
    
    # Open coverage report in browser (optional)
    if command -v open &> /dev/null; then
        echo -e "${YELLOW}Opening coverage report in browser...${NC}"
        open coverage/lcov-report/index.html
    fi
else
    echo -e "${RED}❌ Tests failed or coverage threshold not met${NC}"
    echo -e "${YELLOW}Run 'npm run test:coverage:detailed' for more information${NC}"
    exit 1
fi

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Test coverage report generated successfully!${NC}"
echo -e "${GREEN}View detailed report: coverage/lcov-report/index.html${NC}"