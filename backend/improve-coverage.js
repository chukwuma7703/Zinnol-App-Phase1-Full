#!/usr/bin/env node

/**
 * Test Coverage Improvement Script
 * This script analyzes the current test coverage and generates tests for uncovered code
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Coverage thresholds to aim for
const TARGET_COVERAGE = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80
};

// Priority files/modules based on importance
const PRIORITY_MODULES = {
  HIGH: [
    'controllers/authcontroller.js',
    'controllers/userController.js',
    'controllers/schoolController.js',
    'controllers/studentController.js',
    'controllers/examController.js',
    'controllers/resultController.js',
    'middleware/authMiddleware.js',
    'middleware/errorMiddleware.js',
    'utils/generateToken.js',
    'utils/AppError.js',
    'models/User.js',
    'models/School.js',
    'models/Student.js'
  ],
  MEDIUM: [
    'controllers/classController.js',
    'controllers/subjectController.js',
    'controllers/assignmentController.js',
    'services/notificationService.js',
    'services/resultService.js',
    'utils/sendEmail.js',
    'models/Classroom.js',
    'models/Subject.js',
    'models/Assignment.js'
  ],
  LOW: [
    'controllers/calendarController.js',
    'controllers/eventController.js',
    'utils/weatherUpdater.js',
    'models/calendarEventModel.js'
  ]
};

// Template for generating test files
const generateTestTemplate = (modulePath, moduleName) => {
  const isController = modulePath.includes('controllers');
  const isModel = modulePath.includes('models');
  const isMiddleware = modulePath.includes('middleware');
  const isService = modulePath.includes('services');
  const isUtil = modulePath.includes('utils');

  let template = `import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
`;

  if (isController) {
    template += generateControllerTest(moduleName);
  } else if (isModel) {
    template += generateModelTest(moduleName);
  } else if (isMiddleware) {
    template += generateMiddlewareTest(moduleName);
  } else if (isService) {
    template += generateServiceTest(moduleName);
  } else if (isUtil) {
    template += generateUtilTest(moduleName);
  } else {
    template += generateGenericTest(moduleName);
  }

  return template;
};

const generateControllerTest = (controllerName) => {
  const name = controllerName.replace('Controller', '').replace('.js', '');
  return `import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import ${name}Controller from '../controllers/${controllerName}';

let mongoServer;

describe('${name} Controller', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('GET operations', () => {
    it('should fetch all ${name.toLowerCase()}s', async () => {
      const response = await request(app)
        .get('/api/${name.toLowerCase()}s')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fetch a single ${name.toLowerCase()} by ID', async () => {
      // Create a test ${name.toLowerCase()} first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/${name.toLowerCase()}s')
        .send(testData);

      const id = createResponse.body.data._id;

      const response = await request(app)
        .get(\`/api/${name.toLowerCase()}s/\${id}\`)
        .expect(200);

      expect(response.body.data._id).toBe(id);
    });

    it('should return 404 for non-existent ${name.toLowerCase()}', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await request(app)
        .get(\`/api/${name.toLowerCase()}s/\${fakeId}\`)
        .expect(404);
    });
  });

  describe('POST operations', () => {
    it('should create a new ${name.toLowerCase()}', async () => {
      const testData = {
        // Add appropriate test data fields
      };

      const response = await request(app)
        .post('/api/${name.toLowerCase()}s')
        .send(testData)
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const invalidData = {};

      await request(app)
        .post('/api/${name.toLowerCase()}s')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('PUT operations', () => {
    it('should update an existing ${name.toLowerCase()}', async () => {
      // Create a test ${name.toLowerCase()} first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/${name.toLowerCase()}s')
        .send(testData);

      const id = createResponse.body.data._id;
      const updateData = {
        // Add update fields
      };

      const response = await request(app)
        .put(\`/api/${name.toLowerCase()}s/\${id}\`)
        .send(updateData)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE operations', () => {
    it('should delete an existing ${name.toLowerCase()}', async () => {
      // Create a test ${name.toLowerCase()} first
      const testData = {
        // Add appropriate test data fields
      };

      const createResponse = await request(app)
        .post('/api/${name.toLowerCase()}s')
        .send(testData);

      const id = createResponse.body.data._id;

      await request(app)
        .delete(\`/api/${name.toLowerCase()}s/\${id}\`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(\`/api/${name.toLowerCase()}s/\${id}\`)
        .expect(404);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      jest.spyOn(mongoose.Model.prototype, 'save').mockRejectedValueOnce(new Error('Database error'));

      const testData = {
        // Add appropriate test data fields
      };

      const response = await request(app)
        .post('/api/${name.toLowerCase()}s')
        .send(testData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
`;
};

const generateModelTest = (modelName) => {
  const name = modelName.replace('.js', '');
  return `import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ${name} from '../models/${modelName}';

let mongoServer;

describe('${name} Model', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await ${name}.deleteMany({});
  });

  describe('Schema validation', () => {
    it('should create a valid ${name.toLowerCase()}', async () => {
      const validData = {
        // Add valid test data matching schema
      };

      const instance = new ${name}(validData);
      const saved = await instance.save();

      expect(saved._id).toBeDefined();
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    it('should fail validation for missing required fields', async () => {
      const invalidData = {};

      const instance = new ${name}(invalidData);
      
      await expect(instance.save()).rejects.toThrow(mongoose.Error.ValidationError);
    });

    it('should enforce unique constraints', async () => {
      const data = {
        // Add data with unique fields
      };

      await ${name}.create(data);

      const duplicate = new ${name}(data);
      await expect(duplicate.save()).rejects.toThrow();
    });
  });

  describe('Instance methods', () => {
    // Test any instance methods defined in the schema
    it('should execute instance methods correctly', async () => {
      const instance = new ${name}({
        // Add test data
      });

      // Test instance methods if they exist
      // Example: expect(instance.someMethod()).toBe(expectedValue);
    });
  });

  describe('Static methods', () => {
    // Test any static methods defined in the schema
    it('should execute static methods correctly', async () => {
      // Test static methods if they exist
      // Example: const result = await ${name}.someStaticMethod();
      // expect(result).toBeDefined();
    });
  });

  describe('Virtuals', () => {
    // Test any virtual properties
    it('should compute virtual properties correctly', async () => {
      const instance = new ${name}({
        // Add test data
      });

      // Test virtual properties if they exist
      // Example: expect(instance.virtualProperty).toBe(expectedValue);
    });
  });

  describe('Hooks', () => {
    it('should execute pre-save hooks', async () => {
      const instance = new ${name}({
        // Add test data
      });

      await instance.save();

      // Verify pre-save hook effects
      // Example: expect(instance.hashedPassword).toBeDefined();
    });

    it('should execute post-save hooks', async () => {
      const instance = new ${name}({
        // Add test data
      });

      await instance.save();

      // Verify post-save hook effects
    });
  });
});
`;
};

const generateMiddlewareTest = (middlewareName) => {
  const name = middlewareName.replace('.js', '');
  return `import { jest } from '@jest/globals';
import ${name} from '../middleware/${middlewareName}';

describe('${name} Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      locals: {}
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Success scenarios', () => {
    it('should call next() when conditions are met', async () => {
      // Setup valid request
      req.headers.authorization = 'Bearer valid-token';

      await ${name}(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should attach data to request object', async () => {
      // Setup request
      req.headers.authorization = 'Bearer valid-token';

      await ${name}(req, res, next);

      // Verify data attachment
      // Example: expect(req.user).toBeDefined();
    });
  });

  describe('Error scenarios', () => {
    it('should return 401 for missing authorization', async () => {
      await ${name}(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String)
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for invalid authorization', async () => {
      req.headers.authorization = 'Bearer invalid-token';

      await ${name}(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle errors and call next with error', async () => {
      // Setup to trigger an error
      req.headers.authorization = 'Bearer malformed';

      await ${name}(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Edge cases', () => {
    it('should handle empty request gracefully', async () => {
      req = {};

      await ${name}(req, res, next);

      expect(res.status).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle malformed data', async () => {
      req.headers.authorization = 'malformed';

      await ${name}(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
`;
};

const generateServiceTest = (serviceName) => {
  const name = serviceName.replace('.js', '').replace('Service', '');
  return `import { jest } from '@jest/globals';
import ${name}Service from '../services/${serviceName}';

describe('${name} Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Core functionality', () => {
    it('should perform main service operation', async () => {
      const input = {
        // Add test input
      };

      const result = await ${name}Service.process(input);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle invalid input', async () => {
      const invalidInput = null;

      await expect(${name}Service.process(invalidInput)).rejects.toThrow();
    });

    it('should handle edge cases', async () => {
      const edgeCaseInput = {
        // Add edge case input
      };

      const result = await ${name}Service.process(edgeCaseInput);

      expect(result).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      // Mock external dependencies to throw errors
      const input = {
        // Add test input
      };

      await expect(${name}Service.process(input)).rejects.toThrow();
    });

    it('should retry on transient failures', async () => {
      // Test retry logic if applicable
      const input = {
        // Add test input
      };

      const result = await ${name}Service.processWithRetry(input);

      expect(result).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should integrate with external services', async () => {
      // Test integration points
      const input = {
        // Add test input
      };

      const result = await ${name}Service.callExternal(input);

      expect(result).toBeDefined();
    });
  });
});
`;
};

const generateUtilTest = (utilName) => {
  const name = utilName.replace('.js', '');
  return `import { jest } from '@jest/globals';
import ${name} from '../utils/${utilName}';

describe('${name} Utility', () => {
  describe('Core functionality', () => {
    it('should perform expected transformation', () => {
      const input = 'test-input';
      const expected = 'expected-output';

      const result = ${name}.transform(input);

      expect(result).toBe(expected);
    });

    it('should handle null/undefined input', () => {
      expect(${name}.transform(null)).toBeNull();
      expect(${name}.transform(undefined)).toBeUndefined();
    });

    it('should handle empty input', () => {
      expect(${name}.transform('')).toBe('');
      expect(${name}.transform([])).toEqual([]);
      expect(${name}.transform({})).toEqual({});
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters', () => {
      const specialInput = '!@#$%^&*()';
      const result = ${name}.transform(specialInput);

      expect(result).toBeDefined();
    });

    it('should handle large input', () => {
      const largeInput = 'x'.repeat(10000);
      const result = ${name}.transform(largeInput);

      expect(result).toBeDefined();
    });

    it('should handle concurrent operations', async () => {
      const promises = Array(100).fill(null).map((_, i) => 
        ${name}.asyncTransform(\`input-\${i}\`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      results.forEach(result => expect(result).toBeDefined());
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid input type', () => {
      const invalidInput = Symbol('test');

      expect(() => ${name}.transform(invalidInput)).toThrow();
    });

    it('should provide meaningful error messages', () => {
      const invalidInput = { invalid: true };

      expect(() => ${name}.transform(invalidInput)).toThrow(/Invalid input/);
    });
  });
});
`;
};

const generateGenericTest = (moduleName) => {
  const name = moduleName.replace('.js', '');
  return `import { jest } from '@jest/globals';
import ${name} from '../${moduleName}';

describe('${name}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should export expected functions/objects', () => {
      expect(${name}).toBeDefined();
      // Add specific export checks
    });

    it('should perform basic operations', () => {
      // Add basic operation tests
      expect(true).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle errors gracefully', () => {
      // Add error handling tests
      expect(true).toBe(true);
    });
  });
});
`;
};

// Analyze current coverage and identify gaps
const analyzeCoverage = () => {
  console.log('📊 Analyzing current test coverage...\n');
  
  const coverageReport = {
    overall: {
      statements: 3.43,
      branches: 2.49,
      functions: 2.63,
      lines: 3.46
    },
    needsImprovement: [],
    priority: {
      high: [],
      medium: [],
      low: []
    }
  };

  // Identify files with 0% coverage
  const zeroCoverageFiles = [
    'server.js',
    'config/cache.js',
    'config/db.js',
    'config/distributedCache.js',
    'config/distributedQueue.js',
    'config/firebaseAdmin.js',
    'config/monitoring.js',
    'config/security.js',
    'config/socket.js',
    'controllers/analysisController.js',
    'controllers/authcontroller.js',
    'controllers/buserTransactionController.js',
    'controllers/calendarController.js',
    'controllers/classController.js',
    'controllers/eventController.js',
    'controllers/examController.js',
    'controllers/featureFlagController.js',
    'controllers/googleDriveController.js',
    'controllers/mainSuperAdminController.js',
    'controllers/notificationController.js',
    'controllers/predictiveAnalyticsController.js',
    'controllers/publicController.js',
    'controllers/resultController.js',
    'controllers/schoolController.js',
    'controllers/studentController.js',
    'controllers/subjectController.js',
    'controllers/teacherActivityController.js',
    'controllers/timetableController.js',
    'controllers/userController.js',
    'controllers/voiceResultController.js'
  ];

  // Categorize by priority
  zeroCoverageFiles.forEach(file => {
    const isHighPriority = PRIORITY_MODULES.HIGH.some(p => file.includes(p));
    const isMediumPriority = PRIORITY_MODULES.MEDIUM.some(p => file.includes(p));
    
    if (isHighPriority) {
      coverageReport.priority.high.push(file);
    } else if (isMediumPriority) {
      coverageReport.priority.medium.push(file);
    } else {
      coverageReport.priority.low.push(file);
    }
  });

  return coverageReport;
};

// Generate test files for uncovered modules
const generateTests = async (coverageReport) => {
  console.log('🔧 Generating test files for uncovered modules...\n');
  
  const testDir = path.join(__dirname, 'test', 'generated');
  
  // Create test directory if it doesn't exist
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  let generated = 0;
  const allFiles = [
    ...coverageReport.priority.high,
    ...coverageReport.priority.medium,
    ...coverageReport.priority.low
  ];

  for (const file of allFiles.slice(0, 10)) { // Generate first 10 as example
    const moduleName = path.basename(file);
    const testContent = generateTestTemplate(file, moduleName);
    const testFileName = moduleName.replace('.js', '.test.js');
    const testPath = path.join(testDir, testFileName);
    
    fs.writeFileSync(testPath, testContent);
    generated++;
    console.log(`✅ Generated test: ${testFileName}`);
  }

  console.log(`\n📝 Generated ${generated} test files in ${testDir}`);
  return generated;
};

// Generate coverage improvement report
const generateReport = (coverageReport) => {
  const reportPath = path.join(__dirname, 'coverage-improvement-report.md');
  
  let report = `# Test Coverage Improvement Report
Generated: ${new Date().toISOString()}

## Current Coverage
- **Statements**: ${coverageReport.overall.statements}%
- **Branches**: ${coverageReport.overall.branches}%
- **Functions**: ${coverageReport.overall.functions}%
- **Lines**: ${coverageReport.overall.lines}%

## Target Coverage
- **Statements**: ${TARGET_COVERAGE.statements}%
- **Branches**: ${TARGET_COVERAGE.branches}%
- **Functions**: ${TARGET_COVERAGE.functions}%
- **Lines**: ${TARGET_COVERAGE.lines}%

## Priority Files for Testing

### High Priority (Core Functionality)
${coverageReport.priority.high.map(f => `- [ ] ${f}`).join('\n')}

### Medium Priority (Important Features)
${coverageReport.priority.medium.map(f => `- [ ] ${f}`).join('\n')}

### Low Priority (Supporting Features)
${coverageReport.priority.low.map(f => `- [ ] ${f}`).join('\n')}

## Recommended Actions

1. **Immediate Actions**
   - Focus on high-priority controllers (auth, user, school, student)
   - Add integration tests for critical workflows
   - Implement unit tests for utility functions

2. **Short-term Goals (1-2 weeks)**
   - Achieve 50% coverage for high-priority modules
   - Add error handling tests for all controllers
   - Implement model validation tests

3. **Long-term Goals (1 month)**
   - Reach ${TARGET_COVERAGE.statements}% overall coverage
   - Add end-to-end tests for main user journeys
   - Implement performance tests for critical endpoints

## Testing Strategy

### Unit Tests
- Test individual functions and methods in isolation
- Mock external dependencies
- Focus on edge cases and error conditions

### Integration Tests
- Test module interactions
- Use in-memory database for speed
- Test API endpoints with supertest

### End-to-End Tests
- Test complete user workflows
- Include authentication flows
- Test with real database (test environment)

## Commands to Run

\`\`\`bash
# Run all tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.js

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
\`\`\`

## Next Steps

1. Review generated test templates in \`test/generated/\`
2. Customize test data for your specific use cases
3. Run tests and fix any failures
4. Gradually increase coverage targets
5. Set up CI/CD to enforce coverage thresholds
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Coverage improvement report saved to: ${reportPath}`);
  return reportPath;
};

// Main execution
const main = async () => {
  console.log('🚀 Starting Test Coverage Improvement Process\n');
  console.log('=' .repeat(50) + '\n');

  try {
    // Step 1: Analyze current coverage
    const coverageReport = analyzeCoverage();
    console.log(`📊 Current Overall Coverage: ${coverageReport.overall.statements}%`);
    console.log(`📈 Target Coverage: ${TARGET_COVERAGE.statements}%\n`);

    // Step 2: Generate test files
    const generatedCount = await generateTests(coverageReport);

    // Step 3: Generate improvement report
    const reportPath = generateReport(coverageReport);

    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('✨ Coverage Improvement Process Complete!\n');
    console.log(`📊 Files needing tests: ${coverageReport.priority.high.length + coverageReport.priority.medium.length + coverageReport.priority.low.length}`);
    console.log(`🔧 Test files generated: ${generatedCount}`);
    console.log(`📄 Report location: ${reportPath}`);
    console.log('\nNext steps:');
    console.log('1. Review generated tests in test/generated/');
    console.log('2. Customize test data for your use cases');
    console.log('3. Run: npm run test:coverage');
    console.log('4. Fix failing tests and improve coverage iteratively');

  } catch (error) {
    console.error('❌ Error during coverage improvement:', error);
    process.exit(1);
  }
};

// Run the script
main();