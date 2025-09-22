# CI/CD Pipeline for Zinnol App

This directory contains GitHub Actions workflows for automated testing, linting, and load testing of the Zinnol application.

## Workflows Overview

### 1. `ci-lint-and-test.yml` - Main CI Pipeline
**Triggers:** Push/PR to main, develop, and test branches
**Purpose:** Fast feedback with linting and basic testing

**What it does:**
- ✅ Runs ESLint (same as pre-commit hooks)
- ✅ Executes smoke tests (fast API validation)
- ✅ Runs focused unit tests
- ✅ Basic load testing on main branch
- ✅ Uploads test results and coverage

### 2. `backend-tests.yml` - Comprehensive Backend Testing
**Triggers:** Changes to backend/ directory
**Purpose:** Full test suite with coverage reporting

**What it does:**
- ✅ Smoke tests
- ✅ Unit tests with coverage
- ✅ Integration tests
- ✅ Codecov integration
- ✅ JUnit test results

### 3. `nightly-heavy-tests.yml` - Nightly Comprehensive Testing
**Triggers:** Scheduled (2 AM UTC daily) or manual
**Purpose:** Heavy testing that might be too slow for CI

**What it does:**
- ✅ All test suites
- ✅ Performance benchmarks
- ✅ Heavy integration tests
- ✅ Comprehensive coverage reports

### 4. `load-testing.yml` - Load Testing
**Triggers:** Manual or weekly schedule
**Purpose:** Performance and scalability validation

**What it does:**
- ✅ Artillery load testing with realistic scenarios
- ✅ k6 load testing with configurable stages
- ✅ Multiple user types (admin, teacher, student)
- ✅ Performance metrics and reports
- ✅ Configurable test parameters

## Load Testing Scenarios

The load testing simulates real-world usage patterns:

### Artillery Scenarios:
- **School Management (40%)**: Health checks, authentication, analytics
- **Student Operations (30%)**: Login, class viewing, personal data
- **Teacher Operations (30%)**: Assignments, results management

### k6 Scenarios:
- Progressive load testing (10 → 50 → 50 → 0 users)
- Performance thresholds (95% requests < 500ms, error rate < 10%)
- Role-based testing with realistic API calls

## Usage

### Running Load Tests Manually

1. Go to GitHub Actions → Load Testing workflow
2. Click "Run workflow"
3. Configure parameters:
   - **Duration**: Test duration in seconds (default: 60)
   - **Virtual Users**: Concurrent users (default: 10)
   - **Target URL**: API endpoint to test (default: http://localhost:5000)

### Local Load Testing

```bash
# Using Artillery
cd backend
npm install -g artillery
artillery run load-test-config.yml

# Using k6
brew install k6  # or download from k6.io
k6 run load-test.k6.js
```

## Performance Benchmarks

Based on testing with realistic school usage patterns:

- **Response Time**: < 500ms (95th percentile)
- **Error Rate**: < 10%
- **Concurrent Users**: 50+ simultaneous users
- **Throughput**: 100+ requests/second

## Monitoring & Alerts

The CI/CD pipeline provides:
- ✅ Test failure notifications
- ✅ Coverage reports
- ✅ Performance regression detection
- ✅ Load test results with detailed metrics

## Configuration

### Environment Variables for Testing

```bash
# Required for backend tests
NODE_ENV=test
MONGO_URI=mongodb://127.0.0.1:27017/zinnolTest
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=test-secret-key-for-ci

# Optional feature flags
FIREBASE_ENABLED=false
GOOGLE_DRIVE_ENABLED=false
```

### Customizing Load Tests

Edit `backend/load-test-config.yml` or `backend/load-test.k6.js` to:
- Adjust user scenarios
- Modify load patterns
- Add new API endpoints
- Change performance thresholds

## Best Practices

1. **Fast Feedback**: Use `ci-lint-and-test.yml` for quick validation
2. **Comprehensive Testing**: Use `backend-tests.yml` for full coverage
3. **Performance Validation**: Run load tests before major releases
4. **Nightly Monitoring**: Use scheduled workflows for regression detection

## Troubleshooting

### Common Issues

1. **MongoDB/Redis Connection**: Ensure test databases are available
2. **Port Conflicts**: Backend tests use port 5000 by default
3. **Test Timeouts**: Increase timeout for heavy integration tests
4. **Load Test Failures**: Check server resources and network connectivity

### Debugging

- Check workflow logs in GitHub Actions
- Download test artifacts for detailed results
- Run tests locally with `--verbose` flag
- Use `npm run test:debug` for interactive debugging
