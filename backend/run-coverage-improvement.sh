#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Coverage Improvement Runner${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Function to run tests for a specific module
run_module_tests() {
    local module=$1
    echo -e "${YELLOW}Running tests for: ${module}${NC}"
    
    # Run tests with coverage for specific module
    npm test -- --coverage --collectCoverageFrom="${module}/**/*.js" --coverageDirectory="coverage-${module}" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Tests passed for ${module}${NC}"
    else
        echo -e "${RED}✗ Tests failed for ${module}${NC}"
    fi
    echo ""
}

# Function to generate HTML coverage report
generate_html_report() {
    echo -e "${BLUE}Generating HTML coverage report...${NC}"
    npm run test:coverage -- --coverageReporters=html --coverageDirectory=coverage-html
    echo -e "${GREEN}HTML report generated in coverage-html/index.html${NC}"
}

# Function to check coverage thresholds
check_coverage_thresholds() {
    local coverage_file="coverage-summary/coverage-final.json"
    
    if [ -f "$coverage_file" ]; then
        echo -e "${BLUE}Checking coverage thresholds...${NC}"
        
        # Extract coverage percentages using node
        node -e "
        const coverage = require('./${coverage_file}');
        const summary = coverage.total || {};
        
        const statements = summary.statements?.pct || 0;
        const branches = summary.branches?.pct || 0;
        const functions = summary.functions?.pct || 0;
        const lines = summary.lines?.pct || 0;
        
        console.log('Current Coverage:');
        console.log('  Statements: ' + statements.toFixed(2) + '%');
        console.log('  Branches: ' + branches.toFixed(2) + '%');
        console.log('  Functions: ' + functions.toFixed(2) + '%');
        console.log('  Lines: ' + lines.toFixed(2) + '%');
        
        const target = 80;
        if (statements >= target && branches >= target && functions >= target && lines >= target) {
            console.log('\\n✅ All coverage thresholds met!');
            process.exit(0);
        } else {
            console.log('\\n⚠️  Coverage below target threshold of ' + target + '%');
            process.exit(1);
        }
        " 2>/dev/null || echo -e "${YELLOW}Could not parse coverage data${NC}"
    fi
}

# Main execution
main() {
    # Clean previous coverage reports
    echo -e "${YELLOW}Cleaning previous coverage reports...${NC}"
    rm -rf coverage* 2>/dev/null
    
    # Run tests for priority modules
    echo -e "${BLUE}Running tests for priority modules...${NC}\n"
    
    # High priority modules
    run_module_tests "controllers"
    run_module_tests "models"
    run_module_tests "middleware"
    run_module_tests "utils"
    run_module_tests "services"
    run_module_tests "routes"
    
    # Generate overall coverage report
    echo -e "${BLUE}Generating overall coverage report...${NC}"
    npm run test:coverage
    
    # Generate HTML report
    generate_html_report
    
    # Check coverage thresholds
    check_coverage_thresholds
    
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${GREEN}Coverage improvement process complete!${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # Open HTML report if on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${YELLOW}Opening coverage report in browser...${NC}"
        open coverage-html/index.html 2>/dev/null || echo "Please open coverage-html/index.html manually"
    fi
}

# Parse command line arguments
case "$1" in
    --quick)
        echo -e "${YELLOW}Running quick coverage check...${NC}"
        npm run test:coverage
        ;;
    --watch)
        echo -e "${YELLOW}Running tests in watch mode...${NC}"
        npm run test:watch
        ;;
    --unit)
        echo -e "${YELLOW}Running unit tests only...${NC}"
        npm run test:unit
        ;;
    --integration)
        echo -e "${YELLOW}Running integration tests only...${NC}"
        npm run test:integration
        ;;
    --help)
        echo "Usage: $0 [option]"
        echo "Options:"
        echo "  --quick       Run quick coverage check"
        echo "  --watch       Run tests in watch mode"
        echo "  --unit        Run unit tests only"
        echo "  --integration Run integration tests only"
        echo "  --help        Show this help message"
        echo ""
        echo "Without options, runs full coverage improvement process"
        ;;
    *)
        main
        ;;
esac