#!/bin/bash

# Comprehensive Test Runner for Zinnol Backend
# Runs all tests and generates coverage report

echo "🧪 Zinnol Backend Comprehensive Test Suite"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test categories
declare -a TEST_CATEGORIES=(
  "Unit Tests:test/utils"
  "Middleware Tests:test/middleware"
  "Controller Tests:test/controllers"
  "Model Tests:test/models"
  "Service Tests:test/services"
  "Integration Tests:test/integration"
)

# Function to run tests for a category
run_category_tests() {
  local category_name=$1
  local test_path=$2
  
  echo -e "\n${BLUE}Running ${category_name}...${NC}"
  echo "----------------------------------------"
  
  if [ -d "$test_path" ]; then
    NODE_OPTIONS=--experimental-vm-modules npx jest "$test_path" --coverage --silent 2>&1 | tail -5
  else
    echo -e "${YELLOW}No tests found in $test_path${NC}"
  fi
}

# Create test summary file
SUMMARY_FILE="test-summary.txt"
echo "Test Summary - $(date)" > $SUMMARY_FILE
echo "========================" >> $SUMMARY_FILE

# Run each test category
for category in "${TEST_CATEGORIES[@]}"; do
  IFS=':' read -r name path <<< "$category"
  run_category_tests "$name" "$path"
done

# Run all tests with full coverage
echo -e "\n${GREEN}Running Full Test Suite with Coverage...${NC}"
echo "=========================================="

NODE_OPTIONS=--experimental-vm-modules npx jest --coverage --silent 2>&1 | tee full-coverage.txt

# Extract coverage summary
echo -e "\n${GREEN}Coverage Summary:${NC}"
echo "=================="
grep -A 20 "Coverage summary" full-coverage.txt || tail -20 full-coverage.txt | grep -A 10 "All files"

# Check if coverage meets threshold
COVERAGE_LINE=$(grep "All files" full-coverage.txt | head -1)
if [[ $COVERAGE_LINE =~ ([0-9]+\.?[0-9]*) ]]; then
  COVERAGE=${BASH_REMATCH[1]}
  COVERAGE_INT=${COVERAGE%.*}
  
  echo -e "\n${BLUE}Overall Coverage: ${COVERAGE}%${NC}"
  
  if [ "$COVERAGE_INT" -ge 90 ]; then
    echo -e "${GREEN}✅ Coverage threshold met (≥90%)!${NC}"
    EXIT_CODE=0
  elif [ "$COVERAGE_INT" -ge 70 ]; then
    echo -e "${YELLOW}⚠️ Coverage is good but below target (${COVERAGE}% < 90%)${NC}"
    EXIT_CODE=0
  else
    echo -e "${RED}❌ Coverage is too low (${COVERAGE}% < 70%)${NC}"
    EXIT_CODE=1
  fi
else
  echo -e "${YELLOW}Could not determine coverage percentage${NC}"
  EXIT_CODE=0
fi

# Generate HTML coverage report
echo -e "\n${BLUE}Generating HTML Coverage Report...${NC}"
if [ -d "coverage/lcov-report" ]; then
  echo -e "${GREEN}✅ Coverage report generated at: coverage/lcov-report/index.html${NC}"
  
  # Try to open in browser
  if command -v open &> /dev/null; then
    open coverage/lcov-report/index.html
  elif command -v xdg-open &> /dev/null; then
    xdg-open coverage/lcov-report/index.html
  fi
fi

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Test Run Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

# Show test statistics
TOTAL_TESTS=$(grep -o "Tests:.*total" full-coverage.txt | head -1)
TOTAL_SUITES=$(grep -o "Test Suites:.*total" full-coverage.txt | head -1)

if [ ! -z "$TOTAL_TESTS" ]; then
  echo -e "${BLUE}$TOTAL_SUITES${NC}"
  echo -e "${BLUE}$TOTAL_TESTS${NC}"
fi

# Clean up
rm -f full-coverage.txt

exit $EXIT_CODE