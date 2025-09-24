#!/bin/bash

# Optimized Test Runner for Zinnol Backend
# Provides fast feedback with comprehensive coverage options

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default mode
MODE=${1:-"quick"}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Zinnol Test Suite Runner${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_status() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

run_smoke_tests() {
    print_status "Running smoke tests (target: <5s)..."
    start_time=$(date +%s)
    
    if npm run test:smoke; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        print_success "Smoke tests completed in ${duration}s"
        return 0
    else
        print_error "Smoke tests failed"
        return 1
    fi
}

run_unit_tests() {
    print_status "Running unit tests..."
    if npm run test:unit; then
        print_success "Unit tests completed"
        return 0
    else
        print_error "Unit tests failed"
        return 1
    fi
}

run_integration_tests() {
    print_status "Running integration tests..."
    if npm run test:integration; then
        print_success "Integration tests completed"
        return 0
    else
        print_error "Integration tests failed"
        return 1
    fi
}

run_coverage_report() {
    print_status "Generating coverage report..."
    if npm run test:coverage; then
        print_success "Coverage report generated"
        return 0
    else
        print_error "Coverage generation failed"
        return 1
    fi
}

cleanup_old_coverage() {
    if [ -d "coverage-current" ]; then
        rm -rf coverage-current
        print_status "Cleaned up old coverage data"
    fi
}

print_header

case $MODE in
    "quick"|"q")
        print_status "Running QUICK mode (smoke tests only)"
        cleanup_old_coverage
        if run_smoke_tests; then
            print_success "✅ Quick validation passed - ready for development"
        else
            print_error "❌ Quick validation failed"
            exit 1
        fi
        ;;
    
    "dev"|"d")
        print_status "Running DEV mode (smoke + unit tests)"
        cleanup_old_coverage
        if run_smoke_tests && run_unit_tests; then
            print_success "✅ Development tests passed"
        else
            print_error "❌ Development tests failed"
            exit 1
        fi
        ;;
    
    "ci")
        print_status "Running CI mode (smoke + unit + integration)"
        cleanup_old_coverage
        if run_smoke_tests && run_unit_tests && run_integration_tests; then
            print_success "✅ CI pipeline tests passed"
        else
            print_error "❌ CI pipeline tests failed"
            exit 1
        fi
        ;;
    
    "full"|"f")
        print_status "Running FULL mode (all tests + coverage)"
        cleanup_old_coverage
        if run_smoke_tests && run_unit_tests && run_integration_tests && run_coverage_report; then
            print_success "✅ Full test suite completed with coverage"
            echo -e "${BLUE}Coverage report available at: coverage-current/lcov-report/index.html${NC}"
        else
            print_error "❌ Full test suite failed"
            exit 1
        fi
        ;;
    
    "watch"|"w")
        print_status "Running WATCH mode (smoke tests with file watching)"
        npm run test:smoke:watch
        ;;
    
    "help"|"h"|*)
        echo "Usage: $0 [mode]"
        echo ""
        echo "Modes:"
        echo "  quick, q    - Smoke tests only (<5s, default)"
        echo "  dev, d      - Smoke + unit tests"
        echo "  ci          - Smoke + unit + integration tests"
        echo "  full, f     - All tests + coverage report"
        echo "  watch, w    - Smoke tests in watch mode"
        echo "  help, h     - Show this help"
        echo ""
        echo "Examples:"
        echo "  $0 quick     # Fast feedback during development"
        echo "  $0 dev       # Before committing changes"
        echo "  $0 ci        # For CI/CD pipeline"
        echo "  $0 full      # Complete validation with coverage"
        ;;
esac