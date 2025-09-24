#!/usr/bin/env node

/**
 * Coverage Report Generator
 * Generates a detailed coverage report and recommendations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

class CoverageReporter {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
      uncoveredFiles: [],
      recommendations: [],
    };
  }

  async runTests() {
    console.log(chalk.blue('🧪 Running tests with coverage...\n'));
    
    try {
      const { stdout, stderr } = await execAsync(
        'NODE_OPTIONS=--experimental-vm-modules npx jest --coverage --json --outputFile=coverage-report.json',
        { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      );
      
      // Parse the JSON report
      const reportData = await fs.readFile('coverage-report.json', 'utf-8');
      const report = JSON.parse(reportData);
      
      this.processReport(report);
      
    } catch (error) {
      console.error(chalk.red('Error running tests:'), error.message);
      
      // Try to parse partial results
      try {
        const reportData = await fs.readFile('coverage-report.json', 'utf-8');
        const report = JSON.parse(reportData);
        this.processReport(report);
      } catch (parseError) {
        console.error(chalk.red('Could not parse test results'));
      }
    }
  }

  processReport(report) {
    // Process test results
    if (report.numPassedTests) this.results.passed = report.numPassedTests;
    if (report.numFailedTests) this.results.failed = report.numFailedTests;
    if (report.numPendingTests) this.results.skipped = report.numPendingTests;
    
    // Process coverage
    if (report.coverageMap) {
      const coverage = report.coverageMap;
      let totalStatements = 0, coveredStatements = 0;
      let totalBranches = 0, coveredBranches = 0;
      let totalFunctions = 0, coveredFunctions = 0;
      let totalLines = 0, coveredLines = 0;
      
      Object.values(coverage).forEach(file => {
        // Statements
        totalStatements += file.s ? Object.keys(file.s).length : 0;
        coveredStatements += file.s ? Object.values(file.s).filter(v => v > 0).length : 0;
        
        // Branches
        totalBranches += file.b ? Object.keys(file.b).length : 0;
        coveredBranches += file.b ? Object.values(file.b).flat().filter(v => v > 0).length : 0;
        
        // Functions
        totalFunctions += file.f ? Object.keys(file.f).length : 0;
        coveredFunctions += file.f ? Object.values(file.f).filter(v => v > 0).length : 0;
        
        // Lines
        totalLines += file.l ? Object.keys(file.l).length : 0;
        coveredLines += file.l ? Object.values(file.l).filter(v => v > 0).length : 0;
        
        // Track uncovered files
        const fileCoverage = (coveredLines / (totalLines || 1)) * 100;
        if (fileCoverage < 50) {
          this.results.uncoveredFiles.push({
            path: file.path,
            coverage: fileCoverage.toFixed(2),
          });
        }
      });
      
      this.results.coverage = {
        statements: ((coveredStatements / (totalStatements || 1)) * 100).toFixed(2),
        branches: ((coveredBranches / (totalBranches || 1)) * 100).toFixed(2),
        functions: ((coveredFunctions / (totalFunctions || 1)) * 100).toFixed(2),
        lines: ((coveredLines / (totalLines || 1)) * 100).toFixed(2),
      };
    }
  }

  generateRecommendations() {
    const { coverage, uncoveredFiles } = this.results;
    
    // Overall coverage recommendations
    if (parseFloat(coverage.lines) < 30) {
      this.results.recommendations.push({
        priority: 'HIGH',
        message: 'Critical: Coverage is below 30%. Focus on testing core business logic first.',
        action: 'Start with authentication, user management, and result processing tests.',
      });
    } else if (parseFloat(coverage.lines) < 60) {
      this.results.recommendations.push({
        priority: 'MEDIUM',
        message: 'Coverage needs improvement. Target critical paths and edge cases.',
        action: 'Add integration tests for main workflows and unit tests for utilities.',
      });
    } else if (parseFloat(coverage.lines) < 90) {
      this.results.recommendations.push({
        priority: 'LOW',
        message: 'Good coverage. Focus on remaining untested code.',
        action: 'Add tests for error handling and edge cases.',
      });
    }
    
    // Branch coverage recommendations
    if (parseFloat(coverage.branches) < parseFloat(coverage.lines) - 10) {
      this.results.recommendations.push({
        priority: 'MEDIUM',
        message: 'Branch coverage is low. Test conditional logic and error paths.',
        action: 'Add tests for if/else statements, switch cases, and error conditions.',
      });
    }
    
    // Specific file recommendations
    const criticalFiles = [
      'authMiddleware.js',
      'userController.js',
      'resultController.js',
      'studentController.js',
      'examController.js',
    ];
    
    uncoveredFiles.forEach(file => {
      const fileName = path.basename(file.path);
      if (criticalFiles.includes(fileName)) {
        this.results.recommendations.push({
          priority: 'HIGH',
          message: `Critical file ${fileName} has low coverage (${file.coverage}%)`,
          action: `Add comprehensive tests for ${fileName} immediately.`,
        });
      }
    });
  }

  async generateHTMLReport() {
    console.log(chalk.blue('\n📊 Generating HTML report...\n'));
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Zinnol Backend Coverage Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .metric { background: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #4CAF50; }
    .metric h3 { margin: 0 0 10px 0; color: #666; font-size: 14px; }
    .metric .value { font-size: 32px; font-weight: bold; color: #333; }
    .metric.low { border-left-color: #f44336; }
    .metric.medium { border-left-color: #ff9800; }
    .metric.high { border-left-color: #4CAF50; }
    .recommendations { margin: 20px 0; }
    .recommendation { padding: 15px; margin: 10px 0; border-radius: 5px; }
    .recommendation.HIGH { background: #ffebee; border-left: 4px solid #f44336; }
    .recommendation.MEDIUM { background: #fff3e0; border-left: 4px solid #ff9800; }
    .recommendation.LOW { background: #e8f5e9; border-left: 4px solid #4CAF50; }
    .files { margin: 20px 0; }
    .file { padding: 10px; margin: 5px 0; background: #f9f9f9; border-radius: 3px; }
    .progress { background: #e0e0e0; height: 20px; border-radius: 10px; overflow: hidden; }
    .progress-bar { height: 100%; background: #4CAF50; transition: width 0.3s; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧪 Zinnol Backend Coverage Report</h1>
    
    <div class="summary">
      <div class="metric ${this.getColorClass(this.results.coverage.lines)}">
        <h3>Line Coverage</h3>
        <div class="value">${this.results.coverage.lines}%</div>
        <div class="progress">
          <div class="progress-bar" style="width: ${this.results.coverage.lines}%"></div>
        </div>
      </div>
      
      <div class="metric ${this.getColorClass(this.results.coverage.statements)}">
        <h3>Statement Coverage</h3>
        <div class="value">${this.results.coverage.statements}%</div>
        <div class="progress">
          <div class="progress-bar" style="width: ${this.results.coverage.statements}%"></div>
        </div>
      </div>
      
      <div class="metric ${this.getColorClass(this.results.coverage.branches)}">
        <h3>Branch Coverage</h3>
        <div class="value">${this.results.coverage.branches}%</div>
        <div class="progress">
          <div class="progress-bar" style="width: ${this.results.coverage.branches}%"></div>
        </div>
      </div>
      
      <div class="metric ${this.getColorClass(this.results.coverage.functions)}">
        <h3>Function Coverage</h3>
        <div class="value">${this.results.coverage.functions}%</div>
        <div class="progress">
          <div class="progress-bar" style="width: ${this.results.coverage.functions}%"></div>
        </div>
      </div>
    </div>
    
    <h2>📋 Test Results</h2>
    <div class="summary">
      <div class="metric high">
        <h3>Passed</h3>
        <div class="value">${this.results.passed}</div>
      </div>
      <div class="metric ${this.results.failed > 0 ? 'low' : 'high'}">
        <h3>Failed</h3>
        <div class="value">${this.results.failed}</div>
      </div>
      <div class="metric medium">
        <h3>Skipped</h3>
        <div class="value">${this.results.skipped}</div>
      </div>
    </div>
    
    <h2>💡 Recommendations</h2>
    <div class="recommendations">
      ${this.results.recommendations.map(rec => `
        <div class="recommendation ${rec.priority}">
          <strong>${rec.priority}:</strong> ${rec.message}
          <br><em>Action: ${rec.action}</em>
        </div>
      `).join('')}
    </div>
    
    <h2>📁 Files Needing Coverage</h2>
    <div class="files">
      ${this.results.uncoveredFiles.slice(0, 10).map(file => `
        <div class="file">
          <strong>${path.basename(file.path)}</strong> - ${file.coverage}% coverage
        </div>
      `).join('')}
    </div>
    
    <p style="text-align: center; color: #666; margin-top: 40px;">
      Generated on ${new Date().toLocaleString()}
    </p>
  </div>
</body>
</html>
    `;
    
    await fs.writeFile('coverage-report.html', html);
    console.log(chalk.green('✅ HTML report generated: coverage-report.html'));
  }

  getColorClass(percentage) {
    const value = parseFloat(percentage);
    if (value >= 80) return 'high';
    if (value >= 50) return 'medium';
    return 'low';
  }

  printSummary() {
    console.log(chalk.blue('\n' + '='.repeat(60)));
    console.log(chalk.blue.bold('                 COVERAGE SUMMARY'));
    console.log(chalk.blue('='.repeat(60) + '\n'));
    
    const { coverage } = this.results;
    
    console.log(chalk.cyan('Coverage Metrics:'));
    console.log(`  📊 Statements: ${this.formatPercentage(coverage.statements)}`);
    console.log(`  🌿 Branches:   ${this.formatPercentage(coverage.branches)}`);
    console.log(`  🔧 Functions:  ${this.formatPercentage(coverage.functions)}`);
    console.log(`  📝 Lines:      ${this.formatPercentage(coverage.lines)}`);
    
    console.log(chalk.cyan('\nTest Results:'));
    console.log(`  ✅ Passed:  ${chalk.green(this.results.passed)}`);
    console.log(`  ❌ Failed:  ${chalk.red(this.results.failed)}`);
    console.log(`  ⏭️  Skipped: ${chalk.yellow(this.results.skipped)}`);
    
    console.log(chalk.cyan('\nTop Recommendations:'));
    this.results.recommendations.slice(0, 3).forEach(rec => {
      const icon = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`  ${icon} ${rec.message}`);
    });
    
    const overallCoverage = parseFloat(coverage.lines);
    if (overallCoverage >= 90) {
      console.log(chalk.green.bold('\n🎉 Excellent! Coverage exceeds 90%!'));
    } else if (overallCoverage >= 70) {
      console.log(chalk.yellow.bold('\n👍 Good progress! Keep adding tests to reach 90%.'));
    } else if (overallCoverage >= 50) {
      console.log(chalk.yellow.bold('\n⚠️  Coverage needs improvement. Focus on critical paths.'));
    } else {
      console.log(chalk.red.bold('\n❌ Critical: Coverage is below 50%. Immediate action needed.'));
    }
    
    console.log(chalk.blue('\n' + '='.repeat(60) + '\n'));
  }

  formatPercentage(value) {
    const num = parseFloat(value);
    if (num >= 80) return chalk.green(`${value}%`);
    if (num >= 50) return chalk.yellow(`${value}%`);
    return chalk.red(`${value}%`);
  }

  async run() {
    console.log(chalk.blue.bold('🚀 Zinnol Backend Coverage Report Generator\n'));
    
    await this.runTests();
    this.generateRecommendations();
    await this.generateHTMLReport();
    this.printSummary();
    
    // Clean up
    try {
      await fs.unlink('coverage-report.json');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Run the reporter
const reporter = new CoverageReporter();
reporter.run().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});