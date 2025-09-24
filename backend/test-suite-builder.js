#!/usr/bin/env node

/**
 * Automated Test Suite Builder
 * This script analyzes existing code and generates comprehensive test suites
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test templates for different scenarios
const TEST_TEMPLATES = {
  // Authentication tests
  auth: {
    login: `
    it('should authenticate user with valid credentials', async () => {
      const credentials = { email: 'test@example.com', password: 'password123' };
      const response = await request(app).post('/api/users/login').send(credentials);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
    });`,
    
    logout: `
    it('should logout user successfully', async () => {
      const response = await request(app)
        .post('/api/users/logout')
        .set('Authorization', \`Bearer \${token}\`);
      expect(response.status).toBe(200);
    });`,
    
    register: `
    it('should register new user', async () => {
      const userData = {
        name: 'New User',
        email: 'newuser@example.com',
        password: 'securePassword123'
      };
      const response = await request(app).post('/api/users/register').send(userData);
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
    });`
  },
  
  // CRUD operations tests
  crud: {
    create: `
    it('should create a new resource', async () => {
      const data = { /* resource data */ };
      const response = await request(app)
        .post('/api/RESOURCE')
        .set('Authorization', \`Bearer \${token}\`)
        .send(data);
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject(data);
    });`,
    
    read: `
    it('should fetch resource by ID', async () => {
      const response = await request(app)
        .get(\`/api/RESOURCE/\${resourceId}\`)
        .set('Authorization', \`Bearer \${token}\`);
      expect(response.status).toBe(200);
      expect(response.body.data._id).toBe(resourceId);
    });`,
    
    update: `
    it('should update existing resource', async () => {
      const updates = { /* updated fields */ };
      const response = await request(app)
        .put(\`/api/RESOURCE/\${resourceId}\`)
        .set('Authorization', \`Bearer \${token}\`)
        .send(updates);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject(updates);
    });`,
    
    delete: `
    it('should delete resource', async () => {
      const response = await request(app)
        .delete(\`/api/RESOURCE/\${resourceId}\`)
        .set('Authorization', \`Bearer \${token}\`);
      expect(response.status).toBe(200);
      
      // Verify deletion
      const getResponse = await request(app)
        .get(\`/api/RESOURCE/\${resourceId}\`)
        .set('Authorization', \`Bearer \${token}\`);
      expect(getResponse.status).toBe(404);
    });`
  },
  
  // Validation tests
  validation: {
    required: `
    it('should validate required fields', async () => {
      const invalidData = {}; // Missing required fields
      const response = await request(app)
        .post('/api/RESOURCE')
        .set('Authorization', \`Bearer \${token}\`)
        .send(invalidData);
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });`,
    
    format: `
    it('should validate field formats', async () => {
      const invalidData = {
        email: 'invalid-email',
        phone: '123', // Too short
        date: 'not-a-date'
      };
      const response = await request(app)
        .post('/api/RESOURCE')
        .set('Authorization', \`Bearer \${token}\`)
        .send(invalidData);
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeInstanceOf(Array);
    });`,
    
    unique: `
    it('should enforce unique constraints', async () => {
      const data = { email: 'existing@example.com' };
      
      // Create first instance
      await request(app).post('/api/RESOURCE').send(data);
      
      // Try to create duplicate
      const response = await request(app).post('/api/RESOURCE').send(data);
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });`
  },
  
  // Error handling tests
  errors: {
    notFound: `
    it('should return 404 for non-existent resource', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(\`/api/RESOURCE/\${fakeId}\`)
        .set('Authorization', \`Bearer \${token}\`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });`,
    
    unauthorized: `
    it('should return 401 for unauthorized access', async () => {
      const response = await request(app).get('/api/RESOURCE');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('authorized');
    });`,
    
    forbidden: `
    it('should return 403 for forbidden access', async () => {
      const response = await request(app)
        .delete(\`/api/RESOURCE/\${protectedId}\`)
        .set('Authorization', \`Bearer \${userToken}\`); // User without permission
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('permission');
    });`,
    
    serverError: `
    it('should handle server errors gracefully', async () => {
      // Mock database error
      jest.spyOn(Model.prototype, 'save').mockRejectedValueOnce(new Error('DB Error'));
      
      const response = await request(app)
        .post('/api/RESOURCE')
        .set('Authorization', \`Bearer \${token}\`)
        .send(validData);
      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });`
  },
  
  // Performance tests
  performance: {
    pagination: `
    it('should handle pagination correctly', async () => {
      // Create multiple resources
      await Promise.all(Array(25).fill().map(() => 
        request(app).post('/api/RESOURCE').send(generateData())
      ));
      
      const response = await request(app)
        .get('/api/RESOURCE?page=2&limit=10')
        .set('Authorization', \`Bearer \${token}\`);
      
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.page).toBe(2);
      expect(response.body.totalPages).toBeGreaterThanOrEqual(3);
    });`,
    
    bulkOperations: `
    it('should handle bulk operations efficiently', async () => {
      const bulkData = Array(100).fill().map(() => generateData());
      
      const startTime = Date.now();
      const response = await request(app)
        .post('/api/RESOURCE/bulk')
        .set('Authorization', \`Bearer \${token}\`)
        .send({ items: bulkData });
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(201);
      expect(response.body.created).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });`,
    
    caching: `
    it('should utilize caching for repeated requests', async () => {
      // First request
      const response1 = await request(app)
        .get('/api/RESOURCE/popular')
        .set('Authorization', \`Bearer \${token}\`);
      
      // Second request (should be cached)
      const response2 = await request(app)
        .get('/api/RESOURCE/popular')
        .set('Authorization', \`Bearer \${token}\`);
      
      expect(response1.body).toEqual(response2.body);
      expect(response2.headers['x-cache']).toBe('HIT');
    });`
  },
  
  // Integration tests
  integration: {
    workflow: `
    it('should complete full workflow', async () => {
      // Step 1: Create resource
      const createResponse = await request(app)
        .post('/api/RESOURCE')
        .send(resourceData);
      const resourceId = createResponse.body.data._id;
      
      // Step 2: Update resource
      const updateResponse = await request(app)
        .put(\`/api/RESOURCE/\${resourceId}\`)
        .send(updateData);
      
      // Step 3: Verify changes
      const getResponse = await request(app)
        .get(\`/api/RESOURCE/\${resourceId}\`);
      
      expect(getResponse.body.data).toMatchObject(updateData);
    });`,
    
    crossModule: `
    it('should handle cross-module interactions', async () => {
      // Create related resources
      const school = await createSchool();
      const teacher = await createTeacher(school._id);
      const student = await createStudent(school._id);
      
      // Create assignment
      const assignment = await createAssignment(teacher._id, school._id);
      
      // Submit assignment as student
      const submission = await submitAssignment(assignment._id, student._id);
      
      // Verify relationships
      expect(submission.assignment).toBe(assignment._id);
      expect(submission.student).toBe(student._id);
    });`
  }
};

// Generate test file for a module
const generateModuleTests = (modulePath, moduleName, moduleType) => {
  const testSections = [];
  
  // Add appropriate test templates based on module type
  if (moduleType === 'controller') {
    testSections.push(
      TEST_TEMPLATES.crud.create,
      TEST_TEMPLATES.crud.read,
      TEST_TEMPLATES.crud.update,
      TEST_TEMPLATES.crud.delete,
      TEST_TEMPLATES.validation.required,
      TEST_TEMPLATES.validation.format,
      TEST_TEMPLATES.errors.notFound,
      TEST_TEMPLATES.errors.unauthorized,
      TEST_TEMPLATES.errors.serverError
    );
  } else if (moduleType === 'model') {
    testSections.push(
      TEST_TEMPLATES.validation.required,
      TEST_TEMPLATES.validation.unique,
      TEST_TEMPLATES.validation.format
    );
  } else if (moduleType === 'middleware') {
    testSections.push(
      TEST_TEMPLATES.errors.unauthorized,
      TEST_TEMPLATES.errors.forbidden
    );
  } else if (moduleType === 'service') {
    testSections.push(
      TEST_TEMPLATES.performance.bulkOperations,
      TEST_TEMPLATES.performance.caching,
      TEST_TEMPLATES.integration.workflow
    );
  }
  
  const resourceName = moduleName.replace('Controller', '').replace('Model', '').replace('Service', '').toLowerCase();
  
  const testContent = `
import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';

let mongoServer;
let token;
let resourceId;

describe('${moduleName} Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    
    // Setup authentication token
    const authResponse = await request(app)
      .post('/api/users/login')
      .send({ email: 'admin@example.com', password: 'admin123' });
    token = authResponse.body.accessToken;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections before each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('Core Functionality', () => {
    ${testSections.join('\n\n    ')}
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const response = await request(app)
        .post('/api/${resourceName}')
        .set('Authorization', \`Bearer \${token}\`)
        .send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle malformed data', async () => {
      const response = await request(app)
        .post('/api/${resourceName}')
        .set('Authorization', \`Bearer \${token}\`)
        .send('invalid json');
      expect(response.status).toBe(400);
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill().map(() => 
        request(app)
          .get('/api/${resourceName}')
          .set('Authorization', \`Bearer \${token}\`)
      );
      
      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Security', () => {
    it('should sanitize input to prevent injection', async () => {
      const maliciousData = {
        name: '<script>alert("XSS")</script>',
        description: { $ne: null } // NoSQL injection attempt
      };
      
      const response = await request(app)
        .post('/api/${resourceName}')
        .set('Authorization', \`Bearer \${token}\`)
        .send(maliciousData);
      
      if (response.status === 201) {
        expect(response.body.data.name).not.toContain('<script>');
      }
    });

    it('should enforce rate limiting', async () => {
      const requests = Array(100).fill().map(() => 
        request(app).get('/api/${resourceName}')
      );
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
});

// Helper functions
function generateData() {
  return {
    name: \`Test \${Date.now()}\`,
    description: 'Test description',
    // Add more fields as needed
  };
}

async function createSchool() {
  const response = await request(app)
    .post('/api/schools')
    .set('Authorization', \`Bearer \${token}\`)
    .send({ name: 'Test School', address: '123 Test St' });
  return response.body.data;
}

async function createTeacher(schoolId) {
  const response = await request(app)
    .post('/api/teachers')
    .set('Authorization', \`Bearer \${token}\`)
    .send({ name: 'Test Teacher', email: 'teacher@test.com', school: schoolId });
  return response.body.data;
}

async function createStudent(schoolId) {
  const response = await request(app)
    .post('/api/students')
    .set('Authorization', \`Bearer \${token}\`)
    .send({ name: 'Test Student', email: 'student@test.com', school: schoolId });
  return response.body.data;
}

async function createAssignment(teacherId, schoolId) {
  const response = await request(app)
    .post('/api/assignments')
    .set('Authorization', \`Bearer \${token}\`)
    .send({ 
      title: 'Test Assignment',
      teacher: teacherId,
      school: schoolId,
      dueDate: new Date(Date.now() + 86400000)
    });
  return response.body.data;
}

async function submitAssignment(assignmentId, studentId) {
  const response = await request(app)
    .post('/api/assignments/submit')
    .set('Authorization', \`Bearer \${token}\`)
    .send({ 
      assignment: assignmentId,
      student: studentId,
      content: 'Test submission'
    });
  return response.body.data;
}
`;

  return testContent.replace(/RESOURCE/g, resourceName);
};

// Analyze existing code to determine what tests are needed
const analyzeCodeForTesting = (filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  const analysis = {
    hasAuthentication: false,
    hasCRUD: false,
    hasValidation: false,
    hasErrorHandling: false,
    hasAsync: false,
    endpoints: [],
    methods: [],
    dependencies: []
  };
  
  // Check for authentication
  if (code.includes('jwt') || code.includes('token') || code.includes('auth')) {
    analysis.hasAuthentication = true;
  }
  
  // Check for CRUD operations
  if (code.includes('create') || code.includes('find') || code.includes('update') || code.includes('delete')) {
    analysis.hasCRUD = true;
  }
  
  // Check for validation
  if (code.includes('validate') || code.includes('required') || code.includes('joi') || code.includes('express-validator')) {
    analysis.hasValidation = true;
  }
  
  // Check for error handling
  if (code.includes('try') || code.includes('catch') || code.includes('AppError') || code.includes('next(')) {
    analysis.hasErrorHandling = true;
  }
  
  // Check for async operations
  if (code.includes('async') || code.includes('await') || code.includes('Promise')) {
    analysis.hasAsync = true;
  }
  
  // Extract endpoints (for controllers)
  const endpointMatches = code.match(/@route\s+(\w+)\s+(\/[\w\/:\-]+)/g) || [];
  analysis.endpoints = endpointMatches.map(match => {
    const [, method, path] = match.match(/@route\s+(\w+)\s+(\/[\w\/:\-]+)/);
    return { method, path };
  });
  
  // Extract exported functions
  const exportMatches = code.match(/export\s+(const|function)\s+(\w+)/g) || [];
  analysis.methods = exportMatches.map(match => {
    const [, , name] = match.match(/export\s+(const|function)\s+(\w+)/);
    return name;
  });
  
  return analysis;
};

// Main function to build test suites
const buildTestSuites = async () => {
  console.log('🔨 Building Comprehensive Test Suites\n');
  
  const modules = [
    { path: 'controllers', type: 'controller' },
    { path: 'models', type: 'model' },
    { path: 'middleware', type: 'middleware' },
    { path: 'services', type: 'service' },
    { path: 'utils', type: 'util' }
  ];
  
  let totalGenerated = 0;
  const testDir = path.join(__dirname, 'test', 'automated');
  
  // Create test directory
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  for (const module of modules) {
    const modulePath = path.join(__dirname, module.path);
    
    if (!fs.existsSync(modulePath)) continue;
    
    const files = fs.readdirSync(modulePath).filter(f => f.endsWith('.js') && !f.includes('test'));
    
    for (const file of files.slice(0, 3)) { // Generate 3 tests per module as example
      const filePath = path.join(modulePath, file);
      const analysis = analyzeCodeForTesting(filePath);
      
      console.log(`📝 Analyzing ${file}:`);
      console.log(`   - Has Authentication: ${analysis.hasAuthentication}`);
      console.log(`   - Has CRUD: ${analysis.hasCRUD}`);
      console.log(`   - Has Validation: ${analysis.hasValidation}`);
      console.log(`   - Endpoints: ${analysis.endpoints.length}`);
      console.log(`   - Methods: ${analysis.methods.length}`);
      
      const testContent = generateModuleTests(filePath, file.replace('.js', ''), module.type);
      const testFileName = file.replace('.js', '.automated.test.js');
      const testPath = path.join(testDir, testFileName);
      
      fs.writeFileSync(testPath, testContent);
      console.log(`   ✅ Generated: ${testFileName}\n`);
      totalGenerated++;
    }
  }
  
  // Generate test runner script
  const runnerScript = `#!/bin/bash
# Automated Test Runner

echo "Running automated test suites..."

# Run all automated tests
npm test -- test/automated/*.test.js --coverage

# Generate coverage report
npm test -- --coverage --coverageDirectory=coverage-automated

echo "Test execution complete!"
echo "Coverage report available in coverage-automated/"
`;

  fs.writeFileSync(path.join(__dirname, 'run-automated-tests.sh'), runnerScript);
  fs.chmodSync(path.join(__dirname, 'run-automated-tests.sh'), '755');
  
  console.log(`\n✨ Test Suite Building Complete!`);
  console.log(`📊 Generated ${totalGenerated} test files`);
  console.log(`📁 Test files location: ${testDir}`);
  console.log(`🚀 Run tests with: ./run-automated-tests.sh`);
  
  return totalGenerated;
};

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildTestSuites().catch(console.error);
}

export { generateModuleTests, analyzeCodeForTesting, buildTestSuites };