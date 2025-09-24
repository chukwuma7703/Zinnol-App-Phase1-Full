
import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';

let mongoServer;
let token;
let resourceId;

describe('asyncHandler Tests', () => {
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
    
    it('should return 401 for unauthorized access', async () => {
      const response = await request(app).get('/api/asynchandler');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('authorized');
    });

    
    it('should return 403 for forbidden access', async () => {
      const response = await request(app)
        .delete(`/api/asynchandler/${protectedId}`)
        .set('Authorization', `Bearer ${userToken}`); // User without permission
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('permission');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const response = await request(app)
        .post('/api/asynchandler')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle malformed data', async () => {
      const response = await request(app)
        .post('/api/asynchandler')
        .set('Authorization', `Bearer ${token}`)
        .send('invalid json');
      expect(response.status).toBe(400);
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill().map(() => 
        request(app)
          .get('/api/asynchandler')
          .set('Authorization', `Bearer ${token}`)
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
        .post('/api/asynchandler')
        .set('Authorization', `Bearer ${token}`)
        .send(maliciousData);
      
      if (response.status === 201) {
        expect(response.body.data.name).not.toContain('<script>');
      }
    });

    it('should enforce rate limiting', async () => {
      const requests = Array(100).fill().map(() => 
        request(app).get('/api/asynchandler')
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
    name: `Test ${Date.now()}`,
    description: 'Test description',
    // Add more fields as needed
  };
}

async function createSchool() {
  const response = await request(app)
    .post('/api/schools')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test School', address: '123 Test St' });
  return response.body.data;
}

async function createTeacher(schoolId) {
  const response = await request(app)
    .post('/api/teachers')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Teacher', email: 'teacher@test.com', school: schoolId });
  return response.body.data;
}

async function createStudent(schoolId) {
  const response = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Student', email: 'student@test.com', school: schoolId });
  return response.body.data;
}

async function createAssignment(teacherId, schoolId) {
  const response = await request(app)
    .post('/api/assignments')
    .set('Authorization', `Bearer ${token}`)
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
    .set('Authorization', `Bearer ${token}`)
    .send({ 
      assignment: assignmentId,
      student: studentId,
      content: 'Test submission'
    });
  return response.body.data;
}
